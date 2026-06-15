from flask import Flask, render_template, request, jsonify, send_file
from flask_sqlalchemy import SQLAlchemy
from flask_restful import Api, Resource
from datetime import datetime, timezone
import json
import os
import asyncio
import requests as http_requests

# Import models and business logic
from models import db, Pricelist, Quote, QuoteItem, MonthlyDistribution, DefaultTask, Competitor, SeoAnalysis, ForecastSettings, GoogleAdsSettings
from business_logic import BusinessLogic
from excel_export import ExcelExporter
from competitors_logic import competitors_logic
from seo_analysis_logic import seo_analysis_logic
from forecast_logic import extract_client_domain, pick_market_leader, calculate_forecast
from ahrefs_api_client import ahrefs_api_client, AhrefsApiError
from ga4_prophet import parse_ga4_csv, run_prophet_forecast
from config import config

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///quotes.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)
api = Api(app)

# Initialize business logic
business_logic = BusinessLogic()

# Initialize database and default data
with app.app_context():
    db.create_all()

    import sqlite3
    _conn = sqlite3.connect(app.config['SQLALCHEMY_DATABASE_URI'].replace('sqlite:///', 'instance/'))
    try:
        _conn.execute('ALTER TABLE quote ADD COLUMN brief_json TEXT')
        _conn.commit()
    except sqlite3.OperationalError:
        pass
    for _col_stmt in (
        'ALTER TABLE forecast_settings ADD COLUMN prophet_transactions_forecast_json TEXT',
        'ALTER TABLE forecast_settings ADD COLUMN prophet_transactions_fit_json TEXT',
        'ALTER TABLE google_ads_settings ADD COLUMN product_enabled BOOLEAN DEFAULT 0',
        'ALTER TABLE google_ads_settings ADD COLUMN product_target_revenue FLOAT',
        'ALTER TABLE google_ads_settings ADD COLUMN product_target_roas FLOAT DEFAULT 4.0',
        'ALTER TABLE google_ads_settings ADD COLUMN product_cpc FLOAT',
        'ALTER TABLE google_ads_settings ADD COLUMN product_cvr FLOAT',
        'ALTER TABLE quote_item ADD COLUMN client_months TEXT',
    ):
        try:
            _conn.execute(_col_stmt)
            _conn.commit()
        except sqlite3.OperationalError:
            pass
    # Backfill client_months ze starego client_month (tylko gdy puste)
    try:
        from month_utils import client_month_label_to_csv
        rows = _conn.execute(
            "SELECT id, client_month FROM quote_item "
            "WHERE (client_months IS NULL OR client_months = '') AND client_month != ''"
        ).fetchall()
        for _id, _cm in rows:
            _csv = client_month_label_to_csv(_cm)
            if _csv:
                _conn.execute("UPDATE quote_item SET client_months = ? WHERE id = ?", (_csv, _id))
        _conn.commit()
    except sqlite3.OperationalError:
        pass
    _conn.close()

    # Initialize pricelist if empty
    if Pricelist.query.count() == 0:
        default_prices = [
            ('Expert SEO', 300, 'hour'),
            ('Senior SEO', 300, 'hour'),
            ('Mid SEO', 250, 'hour'),
            ('Junior SEO', 150, 'hour'),
            ('Senior Content', 200, 'hour'),
            ('Mid Content', 150, 'hour'),
            ('Junior Content', 100, 'hour'),
            ('Copywriter Content', 40, '1000chars'),
            ('Copywriter LB', 20, '1000chars'),
            ('Copywriter Treści marketingowe', 80, '1000chars'),
            ('Copywriter Treści AI', 20, '1000chars'),
            ('Formatka', 50, 'piece'),
            ('1 link (średnia cena)', 400, 'piece')
        ]
        
        for specialist_type, price, unit_type in default_prices:
            pricelist_item = Pricelist(
                specialist_type=specialist_type,
                price_per_unit=price,
                unit_type=unit_type
            )
            db.session.add(pricelist_item)
        
        db.session.commit()
    
    # Initialize default tasks if empty
    if DefaultTask.query.count() == 0:
        default_tasks = [
            ('Baza słów kluczowych', 'Mid SEO', 'Miesiąc 1', 12, 250, 3000, 12, 3000, 'Miesiąc 01'),
            ('Audyt SEO Strona + Sklep', 'Mid SEO', 'Miesiąc 1', 40, 250, 10000, 40, 10000, 'Miesiąc 01'),
            ('Audyt linków zewnętrznych', 'Mid SEO', 'Miesiąc 3', 16, 250, 4000, 16, 4000, 'Miesiąc 03'),
            ('Audyt treści', 'Mid Content', 'Miesiąc 2', 15, 150, 2250, 15, 2250, 'Miesiąc 02'),
            ('Audyt Page Experience', 'Mid SEO', 'Miesiąc 1', 20, 250, 5000, 20, 5000, 'Miesiąc 01'),
            ('Audyt Google News', 'Mid SEO', 'Miesiąc 1', 16, 250, 4000, 16, 4000, 'Miesiąc 01'),
            ('Audyt UX i CRO', 'Mid SEO', 'Miesiąc 1', 20, 250, 5000, 20, 5000, 'Miesiąc 01'),
            ('Strategia SEO', 'Senior SEO', 'Miesiąc 1', 4, 300, 1200, 4, 1200, 'Miesiąc 01'),
            ('Migracja domeny', 'Senior SEO', 'Miesiąc 1', 30, 300, 9000, 30, 9000, 'Miesiąc 01'),
            ('Opieka zespołu SEO (~6h)', 'Mid SEO', 'Od Miesiąc 2', 4, 250, 1000, 4, 1000, 'Od Miesiąc 02'),
            ('Linkowanie wewnętrzne - wytyczne', 'Mid SEO', 'Miesiąc 2', 20, 250, 5000, 20, 5000, 'Miesiąc 02'),
            ('Linkowanie wewnętrzne - realizacja', 'Junior SEO', 'Miesiąc 3', 20, 150, 3000, 20, 3000, 'Miesiąc 03'),
            ('Plan treści (24 szt.)', 'Mid SEO', 'Od Miesiąc 2', 2, 250, 500, 2, 500, 'Od Miesiąc 02'),
            ('Formatka (4 szt.)', 'Formatka', 'Od Miesiąc 2', 10, 50, 500, 4, 200, 'Od Miesiąc 02'),
            ('Strategia linkbuildingowa', 'Mid SEO', 'Miesiąc 2', 12, 250, 3000, 12, 3000, 'Miesiąc 02'),
            ('Linkbuilding - marża', 'Senior SEO', 'Od Miesiąc 2', 1, 300, 300, 1, 300, 'Od Miesiąc 02'),
            ('Raportowanie', 'Mid SEO', 'Miesiąc 3', 6, 250, 1500, 6, 1500, 'Miesiąc 03'),
            ('Raport Looker Studio', 'Mid SEO', 'Miesiąc 6', 6, 250, 1500, 6, 1500, 'Miesiąc 06'),
            ('GA4 - konfiguracja', 'Mid SEO', 'Miesiąc 12', 6, 250, 1500, 6, 1500, 'Miesiąc 12'),
            ('GA4 + GTM - weryfikacja', 'Senior SEO', 'Miesiąc 1', 2, 300, 600, 2, 600, 'Miesiąc 01'),
            ('GTM - konfiguracja śledzenia', 'Senior SEO', 'Miesiąc 1', 12, 300, 3600, 12, 3600, 'Miesiąc 01'),
            ('Audyt i wytyczne do GMF', 'Mid SEO', 'Miesiąc 2', 10, 250, 2500, 10, 2500, 'Miesiąc 02'),
            ('Obsługa GMF', 'Mid SEO', 'Od Miesiąc 1', 2, 250, 500, 2, 500, 'Od Miesiąc 01'),
            ('Obsługa Google Ads', 'Mid SEO', 'Od Miesiąc 1', 5000, 20, 1000, 5000, 1000, 'Od Miesiąc 01'),
            ('Obsługa Facebook', 'Mid SEO', 'Od Miesiąc 1', 1, 1500, 1500, 1, 1500, 'Od Miesiąc 01'),
            ('Napisanie treści (xMnożnik)', 'Copywriter Content', 'Miesiąc 2', 5, 40, 200, 5, 200, 'Miesiąc 02'),
            ('Napisanie treści Marketingowych', 'Copywriter Treści marketingowe', 'Miesiąc 1', 0, 80, 0, 0, 0, 'Miesiąc 01'),
            ('Napisanie treści AI (1x1)', 'Copywriter Treści AI', 'Od Miesiąc 2', 0, 20, 0, 0, 0, 'Od Miesiąc 02'),
            ('Facebook Ads', 'Mid SEO', 'Od Miesiąc 1', 4, 1500, 6000, 4, 6000, 'Od Miesiąc 01')
        ]
        
        for task_name, specialist_type, month_execution, hours_or_units, price_per_unit, total_price, client_units, client_price, client_month in default_tasks:
            default_task = DefaultTask(
                task_name=task_name,
                specialist_type=specialist_type,
                month_execution=month_execution,
                hours_or_units=hours_or_units,
                price_per_unit=price_per_unit,
                total_price=total_price,
                client_units=client_units,
                client_price=client_price,
                client_month=client_month
            )
            db.session.add(default_task)
        
        db.session.commit()

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/quotes')
def quotes():
    return render_template('quote_editor.html')

@app.route('/pricelist')
def pricelist():
    return render_template('pricelist.html')

@app.route('/templates')
def templates():
    return render_template('task_templates.html')

# API Resources
class PricelistAPI(Resource):
    def get(self):
        pricelist = Pricelist.query.all()
        return {
            'pricelist': [{
                'id': item.id,
                'specialist_type': item.specialist_type,
                'price_per_unit': item.price_per_unit,
                'unit_type': item.unit_type
            } for item in pricelist]
        }
    
    def put(self, item_id):
        data = request.get_json()
        item = Pricelist.query.get_or_404(item_id)
        item.price_per_unit = data.get('price_per_unit', item.price_per_unit)
        db.session.commit()
        return {'message': 'Price updated successfully'}

class QuotesAPI(Resource):
    def get(self, quote_id=None):
        if quote_id:
            quote = Quote.query.get_or_404(quote_id)
            items = QuoteItem.query.filter_by(quote_id=quote_id).all()
            monthly_dist = {}
            for item in items:
                monthly_dist[item.id] = {
                    dist.month_number: dist.amount 
                    for dist in MonthlyDistribution.query.filter_by(quote_item_id=item.id)
                }
            
            return {
                'quote': {
                    'id': quote.id,
                    'name': quote.name,
                    'created_at': quote.created_at.isoformat(),
                    'updated_at': quote.updated_at.isoformat(),
                    'lb_budget': quote.lb_budget,
                    'chars_in_thousands': quote.chars_in_thousands,
                    'rate_per_1000_chars': quote.rate_per_1000_chars,
                    'rate_multiplier': quote.rate_multiplier,
                    'num_texts': quote.num_texts,
                    'lb_marza_month': quote.lb_marza_month,
                    'lb_budzet_month': quote.lb_budzet_month,
                    'content_month': quote.content_month
                },
                'items': [{
                    'id': item.id,
                    'task_name': item.task_name,
                    'specialist_type': item.specialist_type,
                    'month_execution': item.month_execution,
                    'hours_or_units': item.hours_or_units,
                    'price_per_unit': item.price_per_unit,
                    'total_price': item.total_price,
                    'client_units': item.client_units,
                    'client_price': item.client_price,
                    'client_month': item.client_month,
                    'is_auto_generated': item.is_auto_generated,
                    'monthly_distribution': monthly_dist.get(item.id, {})
                } for item in items]
            }
        else:
            quotes = Quote.query.all()
            return {
                'quotes': [{
                    'id': quote.id,
                    'name': quote.name,
                    'created_at': quote.created_at.isoformat(),
                    'updated_at': quote.updated_at.isoformat(),
                    'total_value': sum(item.client_price for item in quote.items)
                } for quote in quotes]
            }
    
    def post(self):
        data = request.get_json()
        quote = Quote(
            name=data.get('name', 'Nowa wycena'),
            lb_budget=data.get('lb_budget', 0),
            chars_in_thousands=data.get('chars_in_thousands', 0),
            rate_per_1000_chars=data.get('rate_per_1000_chars', 0),
            rate_multiplier=data.get('rate_multiplier', 1),
            num_texts=data.get('num_texts', 0),
            lb_marza_month=data.get('lb_marza_month', 'Od Miesiąc 02'),
            lb_budzet_month=data.get('lb_budzet_month', 'Od Miesiąc 02'),
            content_month=data.get('content_month', 'Od Miesiąc 02')
        )
        db.session.add(quote)
        db.session.commit()
        
        # Auto generation removed - tasks are now added manually via UI buttons
        
        return {'id': quote.id, 'message': 'Quote created successfully'}
    
    def put(self, quote_id):
        data = request.get_json()
        quote = Quote.query.get_or_404(quote_id)
        
        # Update quote parameters
        quote.name = data.get('name', quote.name)
        quote.lb_budget = data.get('lb_budget', quote.lb_budget)
        quote.chars_in_thousands = data.get('chars_in_thousands', quote.chars_in_thousands)
        quote.rate_per_1000_chars = data.get('rate_per_1000_chars', quote.rate_per_1000_chars)
        quote.rate_multiplier = data.get('rate_multiplier', quote.rate_multiplier)
        quote.num_texts = data.get('num_texts', quote.num_texts)
        quote.lb_marza_month = data.get('lb_marza_month', quote.lb_marza_month)
        quote.lb_budzet_month = data.get('lb_budzet_month', quote.lb_budzet_month)
        quote.content_month = data.get('content_month', quote.content_month)
        quote.updated_at = datetime.now(timezone.utc)
        
        db.session.commit()
        
        # Auto generation removed - tasks are now added manually via UI buttons
        
        return {'message': 'Quote updated successfully'}
    
    def delete(self, quote_id):
        quote = Quote.query.get_or_404(quote_id)
        
        # Delete all related items and monthly distributions
        for item in quote.items:
            MonthlyDistribution.query.filter_by(quote_item_id=item.id).delete()
            db.session.delete(item)
        
        # Delete all related competitors
        Competitor.query.filter_by(quote_id=quote_id).delete()
        
        # Delete all related SEO analyses
        SeoAnalysis.query.filter_by(quote_id=quote_id).delete()
        
        # Delete forecast settings
        ForecastSettings.query.filter_by(quote_id=quote_id).delete()

        GoogleAdsSettings.query.filter_by(quote_id=quote_id).delete()
        
        db.session.delete(quote)
        db.session.commit()
        return {'message': 'Quote deleted successfully'}

class QuoteItemsAPI(Resource):
    def post(self, quote_id):
        data = request.get_json()
        item = QuoteItem(
            quote_id=quote_id,
            task_name=data.get('task_name', ''),
            specialist_type=data.get('specialist_type', ''),
            month_execution=data.get('month_execution', ''),
            hours_or_units=data.get('hours_or_units', 0),
            price_per_unit=data.get('price_per_unit', 0),
            total_price=data.get('total_price', 0),
            client_units=data.get('client_units', 0),
            client_price=data.get('client_price', 0),
            client_month=data.get('client_month', ''),
            is_auto_generated=False
        )
        db.session.add(item)
        db.session.commit()
        
        # Generate monthly distribution
        business_logic.generate_monthly_distribution(item.id)
        
        return {'id': item.id, 'message': 'Item added successfully'}
    
    def put(self, quote_id, item_id):
        data = request.get_json()
        item = QuoteItem.query.filter_by(id=item_id, quote_id=quote_id).first_or_404()
        
        item.task_name = data.get('task_name', item.task_name)
        item.specialist_type = data.get('specialist_type', item.specialist_type)
        item.month_execution = data.get('month_execution', item.month_execution)
        item.hours_or_units = data.get('hours_or_units', item.hours_or_units)
        item.price_per_unit = data.get('price_per_unit', item.price_per_unit)
        item.total_price = data.get('total_price', item.total_price)
        item.client_units = data.get('client_units', item.client_units)
        item.client_price = data.get('client_price', item.client_price)
        item.client_month = data.get('client_month', item.client_month)
        
        db.session.commit()
        
        # Regenerate monthly distribution
        business_logic.regenerate_monthly_distribution(item_id)
        
        return {'message': 'Item updated successfully'}
    
    def delete(self, quote_id, item_id):
        item = QuoteItem.query.filter_by(id=item_id, quote_id=quote_id).first_or_404()
        
        # Delete monthly distributions
        MonthlyDistribution.query.filter_by(quote_item_id=item_id).delete()
        db.session.delete(item)
        db.session.commit()
        
        return {'message': 'Item deleted successfully'}

class DefaultTasksAPI(Resource):
    def get(self, task_id=None):
        if task_id:
            task = DefaultTask.query.get_or_404(task_id)
            return {'default_task': task.to_dict()}
        else:
            default_tasks = DefaultTask.query.all()
            return {
                'default_tasks': [task.to_dict() for task in default_tasks]
            }
    
    def post(self):
        data = request.get_json()
        task = DefaultTask(
            task_name=data.get('task_name', ''),
            specialist_type=data.get('specialist_type', ''),
            month_execution=data.get('month_execution', ''),
            hours_or_units=data.get('hours_or_units', 0),
            price_per_unit=data.get('price_per_unit', 0),
            total_price=data.get('total_price', 0),
            client_units=data.get('client_units', 0),
            client_price=data.get('client_price', 0),
            client_month=data.get('client_month', '')
        )
        db.session.add(task)
        db.session.commit()
        return {'id': task.id, 'message': 'Template created successfully'}
    
    def put(self, task_id):
        data = request.get_json()
        task = DefaultTask.query.get_or_404(task_id)
        
        task.task_name = data.get('task_name', task.task_name)
        task.specialist_type = data.get('specialist_type', task.specialist_type)
        task.month_execution = data.get('month_execution', task.month_execution)
        task.hours_or_units = data.get('hours_or_units', task.hours_or_units)
        task.price_per_unit = data.get('price_per_unit', task.price_per_unit)
        task.total_price = data.get('total_price', task.total_price)
        task.client_units = data.get('client_units', task.client_units)
        task.client_price = data.get('client_price', task.client_price)
        task.client_month = data.get('client_month', task.client_month)
        
        db.session.commit()
        return {'message': 'Template updated successfully'}
    
    def delete(self, task_id):
        task = DefaultTask.query.get_or_404(task_id)
        db.session.delete(task)
        db.session.commit()
        return {'message': 'Template deleted successfully'}

class ExportAPI(Resource):
    def get(self, quote_id):
        quote = Quote.query.get_or_404(quote_id)
        exporter = ExcelExporter()
        
        # Create temporary file
        filename = f"wycena_{quote.name.replace(' ', '_')}.xlsx"
        filepath = os.path.join('temp', filename)
        
        if not os.path.exists('temp'):
            os.makedirs('temp')
        
        exporter.export_quote(quote_id, filepath)
        
        return send_file(filepath, as_attachment=True, download_name=filename)

class CompetitorsAPI(Resource):
    def get(self, quote_id):
        """Pobierz listę konkurentów dla danej wyceny."""
        quote = Quote.query.get_or_404(quote_id)
        competitors = Competitor.query.filter_by(quote_id=quote_id).order_by(Competitor.occurrences.desc()).all()
        
        return {
            'competitors': [competitor.to_dict() for competitor in competitors]
        }
    
    def post(self, quote_id):
        """Analizuj konkurencję na podstawie słów kluczowych."""
        print(f"🎯 POST /api/quotes/{quote_id}/competitors - rozpoczęcie analizy")
        
        quote = Quote.query.get_or_404(quote_id)
        data = request.get_json()
        
        keywords_text = data.get('keywords', '')
        print(f"📝 Otrzymano słowa kluczowe: {keywords_text[:100]}...")
        
        if not keywords_text:
            print("❌ Brak słów kluczowych")
            return {'error': 'Brak słów kluczowych'}, 400
        
        # Parsuj słowa kluczowe
        keywords = competitors_logic.parse_keywords_input(keywords_text)
        print(f"🔍 Sparsowano {len(keywords)} słów kluczowych: {keywords[:5]}...")
        
        # Waliduj
        is_valid, error_message = competitors_logic.validate_keywords(keywords)
        if not is_valid:
            print(f"❌ Walidacja nieudana: {error_message}")
            return {'error': error_message}, 400
        
        print("✅ Walidacja przeszła pomyślnie")
        
        try:
            print("🚀 Rozpoczynam analizę asynchroniczną...")
            # Uruchom analizę asynchronicznie
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            domain_counts = loop.run_until_complete(competitors_logic.analyze_keywords(keywords))
            loop.close()
            
            print(f"📊 Analiza zakończona, znaleziono {len(domain_counts)} domen")
            
            # Usuń poprzednie wyniki dla tej wyceny
            deleted_count = Competitor.query.filter_by(quote_id=quote_id).count()
            Competitor.query.filter_by(quote_id=quote_id).delete()
            print(f"🗑️ Usunięto {deleted_count} poprzednich wyników")
            
            # Zapisz nowe wyniki
            competitors = []
            for domain, count in domain_counts.items():
                competitor = Competitor(
                    quote_id=quote_id,
                    domain=domain,
                    occurrences=count
                )
                db.session.add(competitor)
                competitors.append(competitor)
            
            db.session.commit()
            print(f"💾 Zapisano {len(competitors)} nowych konkurentów do bazy danych")
            
            return {
                'message': f'Analiza zakończona. Znaleziono {len(competitors)} konkurentów.',
                'competitors': [competitor.to_dict() for competitor in competitors]
            }
            
        except Exception as e:
            print(f"💥 Błąd podczas analizy: {str(e)}")
            db.session.rollback()
            return {'error': f'Błąd podczas analizy: {str(e)}'}, 500

class SeoAnalysisAPI(Resource):
    def get(self, quote_id):
        """Pobierz wyniki analizy SEO dla danej wyceny."""
        quote = Quote.query.get_or_404(quote_id)
        seo_results = SeoAnalysis.query.filter_by(quote_id=quote_id).order_by(SeoAnalysis.domain).all()
        
        # Oblicz średnie
        results_data = [result.to_dict() for result in seo_results]
        averages = seo_analysis_logic.calculate_averages(results_data)
        
        return {
            'seo_results': results_data,
            'averages': averages,
            'count': len(results_data),
            'warnings': seo_analysis_logic.integration_warnings(results_data),
        }
    
    def post(self, quote_id):
        """Analizuj domeny SEO."""
        print(f"🎯 POST /api/quotes/{quote_id}/seo-analysis - rozpoczęcie analizy SEO")
        
        quote = Quote.query.get_or_404(quote_id)
        data = request.get_json()
        
        domains_text = data.get('domains', '')
        print(f"📝 Otrzymano domeny: {domains_text[:100]}...")
        
        if not domains_text:
            print("❌ Brak domen")
            return {'error': 'Brak domen do analizy'}, 400
        
        # Parsuj domeny
        domains = seo_analysis_logic.parse_domains_input(domains_text)
        print(f"🔍 Sparsowano {len(domains)} domen: {domains[:3]}...")
        
        # Waliduj
        is_valid, error_message = seo_analysis_logic.validate_domains(domains)
        if not is_valid:
            print(f"❌ Walidacja nieudana: {error_message}")
            return {'error': error_message}, 400
        
        print("✅ Walidacja przeszła pomyślnie")
        
        try:
            print("🚀 Rozpoczynam analizę SEO...")
            # Uruchom analizę
            results = seo_analysis_logic.analyze_domains(quote_id, domains)
            
            # Oblicz średnie
            averages = seo_analysis_logic.calculate_averages(results)
            
            print(f"📊 Analiza SEO zakończona, przeanalizowano {len(results)} domen")
            
            return {
                'message': f'Analiza SEO zakończona. Przeanalizowano {len(results)} domen.',
                'seo_results': results,
                'averages': averages,
                'count': len(results),
                'warnings': seo_analysis_logic.integration_warnings(results),
            }
            
        except Exception as e:
            print(f"💥 Błąd podczas analizy SEO: {str(e)}")
            db.session.rollback()
            return {'error': f'Błąd podczas analizy SEO: {str(e)}'}, 500

class SeoAnalysisExportAPI(Resource):
    def get(self, quote_id):
        """Eksportuj wyniki analizy SEO do CSV."""
        quote = Quote.query.get_or_404(quote_id)
        
        # Sprawdź czy są wyniki do eksportu
        seo_results = SeoAnalysis.query.filter_by(quote_id=quote_id).all()
        if not seo_results:
            return {'error': 'Brak wyników analizy SEO do eksportu'}, 404
        
        # Utwórz plik CSV
        filename = f"analiza_seo_{quote.name.replace(' ', '_')}.csv"
        filepath = os.path.join('temp', filename)
        
        if not os.path.exists('temp'):
            os.makedirs('temp')
        
        # Eksportuj do CSV
        success = seo_analysis_logic.export_to_csv(quote_id, filepath)
        
        if success:
            return send_file(filepath, as_attachment=True, download_name=filename)
        else:
            return {'error': 'Błąd podczas eksportu CSV'}, 500

def _status_for_ahrefs_error(exc: AhrefsApiError) -> int:
    """Mapuj komunikat AhrefsApiError na sensowny HTTP status dla API Flask."""
    msg = str(exc)
    for code in (400, 401, 403, 429):
        if f"HTTP {code}" in msg:
            return code
    return 502


class ForecastSeasonalityAPI(Resource):
    def get(self, quote_id):
        """Pobierz 12 mnożników sezonowości z Ahrefs metrics-history dla lidera."""
        Quote.query.get_or_404(quote_id)
        leader = request.args.get('leader', '').strip()
        if not leader:
            return {'error': 'Brak parametru leader (domena lidera rynku)'}, 400

        try:
            seasonality = ahrefs_api_client.compute_seasonality(leader, months=24)
            history = ahrefs_api_client.get_organic_traffic_history(leader, months=24)
            return {
                'leader': leader,
                'seasonality': seasonality,
                'history': history,
            }
        except AhrefsApiError as e:
            return {'error': f'Ahrefs API error: {str(e)}'}, _status_for_ahrefs_error(e)


class ForecastAPI(Resource):
    def get(self, quote_id):
        """Wczytaj zapisany forecast."""
        Quote.query.get_or_404(quote_id)
        fs = ForecastSettings.query.filter_by(quote_id=quote_id).first()
        if not fs:
            return {'forecast_settings': None}
        result = fs.to_dict()
        try:
            result['seasonality'] = json.loads(fs.seasonality_json) if fs.seasonality_json else [1.0] * 12
        except (json.JSONDecodeError, TypeError):
            result['seasonality'] = [1.0] * 12
        try:
            forecast_data = json.loads(fs.forecast_json) if fs.forecast_json else None
            result['forecast'] = forecast_data
            if isinstance(forecast_data, dict):
                for k in ['variance_top', 'variance_traffic', 'variance_revenue',
                           'kw_per_url_pct', 'traffic_per_kw_pct']:
                    if k in forecast_data:
                        result[k] = forecast_data[k]
        except (json.JSONDecodeError, TypeError):
            result['forecast'] = None
        try:
            result['prophet_forecast'] = json.loads(fs.prophet_forecast_json) if fs.prophet_forecast_json else None
        except (json.JSONDecodeError, TypeError):
            result['prophet_forecast'] = None
        try:
            result['ga4_history'] = json.loads(fs.ga4_data_json) if fs.ga4_data_json else None
        except (json.JSONDecodeError, TypeError):
            result['ga4_history'] = None
        try:
            result['ga4_seasonality'] = json.loads(fs.ga4_seasonality_json) if fs.ga4_seasonality_json else None
        except (json.JSONDecodeError, TypeError):
            result['ga4_seasonality'] = None
        try:
            result['prophet_revenue_forecast'] = json.loads(fs.prophet_revenue_forecast_json) if fs.prophet_revenue_forecast_json else None
        except (json.JSONDecodeError, TypeError):
            result['prophet_revenue_forecast'] = None
        try:
            result['prophet_fit'] = json.loads(fs.prophet_fit_json) if fs.prophet_fit_json else None
        except (json.JSONDecodeError, TypeError):
            result['prophet_fit'] = None
        try:
            result['prophet_revenue_fit'] = json.loads(fs.prophet_revenue_fit_json) if fs.prophet_revenue_fit_json else None
        except (json.JSONDecodeError, TypeError):
            result['prophet_revenue_fit'] = None
        try:
            result['prophet_transactions_forecast'] = (
                json.loads(fs.prophet_transactions_forecast_json)
                if getattr(fs, 'prophet_transactions_forecast_json', None) else None
            )
        except (json.JSONDecodeError, TypeError, AttributeError):
            result['prophet_transactions_forecast'] = None
        try:
            result['prophet_transactions_fit'] = (
                json.loads(fs.prophet_transactions_fit_json)
                if getattr(fs, 'prophet_transactions_fit_json', None) else None
            )
        except (json.JSONDecodeError, TypeError, AttributeError):
            result['prophet_transactions_fit'] = None
        return {'forecast_settings': result}

    def post(self, quote_id):
        """Zapisz ustawienia forecastu i opcjonalnie oblicz server-side."""
        Quote.query.get_or_404(quote_id)
        data = request.get_json() or {}

        fs = ForecastSettings.query.filter_by(quote_id=quote_id).first()
        if not fs:
            fs = ForecastSettings(quote_id=quote_id)
            db.session.add(fs)

        fs.client_domain = data.get('client_domain', fs.client_domain or '')
        fs.leader_domain = data.get('leader_domain', fs.leader_domain or '')
        fs.conversion_rate = float(data.get('conversion_rate', fs.conversion_rate or 0.018))
        fs.aov = float(data.get('aov', fs.aov or 0))
        fs.margin = float(data.get('margin', fs.margin or 0.15))
        fs.fixed_seo_budget = float(data.get('fixed_seo_budget', fs.fixed_seo_budget or 0))
        fs.monthly_content_volume = int(data.get('monthly_content_volume', fs.monthly_content_volume or 0))
        fs.no_effect_months = int(data.get('no_effect_months', fs.no_effect_months if fs.no_effect_months is not None else 2))

        lb_rate = data.get('lb_rate_override')
        fs.lb_rate_override = float(lb_rate) if lb_rate is not None else None
        lb_cost = data.get('lb_cost_override')
        fs.lb_cost_override = float(lb_cost) if lb_cost is not None else None

        seasonality = data.get('seasonality')
        if seasonality and isinstance(seasonality, list) and len(seasonality) == 12:
            fs.seasonality_json = json.dumps(seasonality)

        extra_keys = ['variance_top', 'variance_traffic', 'variance_revenue',
                      'kw_per_url_pct', 'traffic_per_kw_pct']
        forecast = data.get('forecast') or {}
        for k in extra_keys:
            if k in data:
                forecast[k] = data[k]
        if forecast:
            fs.forecast_json = json.dumps(forecast)

        db.session.commit()
        return {'message': 'Forecast settings saved', 'id': fs.id}


class GA4UploadAPI(Resource):
    def post(self, quote_id):
        """Upload GA4 CSV, run Prophet, save results."""
        Quote.query.get_or_404(quote_id)

        if 'file' not in request.files:
            return {'error': 'Brak pliku CSV (pole: file)'}, 400

        file = request.files['file']
        if not file.filename:
            return {'error': 'Pusty plik'}, 400

        try:
            content = file.read()
            df = parse_ga4_csv(content)
            prophet_result = run_prophet_forecast(df, periods=12)
        except ValueError as e:
            return {'error': f'Błąd parsowania CSV: {str(e)}'}, 400
        except Exception as e:
            return {'error': f'Błąd Prophet: {str(e)}'}, 500

        fs = ForecastSettings.query.filter_by(quote_id=quote_id).first()
        if not fs:
            fs = ForecastSettings(quote_id=quote_id)
            db.session.add(fs)

        fs.ga4_csv_filename = file.filename
        fs.ga4_data_json = json.dumps(prophet_result.get('history', []))
        fs.prophet_forecast_json = json.dumps(prophet_result.get('forecast', []))

        revenue_fc = prophet_result.get('revenue_forecast')
        fs.prophet_revenue_forecast_json = json.dumps(revenue_fc) if revenue_fc else None

        traffic_fit = prophet_result.get('prophet_fit')
        fs.prophet_fit_json = json.dumps(traffic_fit) if traffic_fit else None
        revenue_fit = prophet_result.get('revenue_fit')
        fs.prophet_revenue_fit_json = json.dumps(revenue_fit) if revenue_fit else None

        tx_fc = prophet_result.get('transactions_forecast')
        fs.prophet_transactions_forecast_json = json.dumps(tx_fc) if tx_fc else None
        tx_fit = prophet_result.get('transactions_fit')
        fs.prophet_transactions_fit_json = json.dumps(tx_fit) if tx_fit else None

        seasonality = prophet_result.get('seasonality')
        if seasonality and len(seasonality) == 12:
            fs.ga4_seasonality_json = json.dumps(seasonality)

        if prophet_result.get('ga4_metrics', {}).get('avg_conversion_rate'):
            fs.conversion_rate = prophet_result['ga4_metrics']['avg_conversion_rate']
        if prophet_result.get('ga4_metrics', {}).get('avg_aov'):
            fs.aov = prophet_result['ga4_metrics']['avg_aov']

        db.session.commit()

        return {
            'message': 'GA4 data processed with Prophet',
            'filename': file.filename,
            'data_months': prophet_result.get('data_months', 0),
            'forecast_months': len(prophet_result.get('forecast', [])),
            'seasonality': seasonality,
            'ga4_metrics': prophet_result.get('ga4_metrics', {}),
            'prophet_forecast': prophet_result.get('forecast', []),
            'ga4_history': prophet_result.get('history', []),
            'revenue_forecast': revenue_fc,
            'prophet_fit': prophet_result.get('prophet_fit'),
            'revenue_fit': prophet_result.get('revenue_fit'),
            'transactions_forecast': prophet_result.get('transactions_forecast'),
            'transactions_fit': prophet_result.get('transactions_fit'),
            'granularity': prophet_result.get('granularity'),
            'n_observations': prophet_result.get('n_observations', 0),
        }

    def delete(self, quote_id):
        """Remove GA4/Prophet data."""
        Quote.query.get_or_404(quote_id)
        fs = ForecastSettings.query.filter_by(quote_id=quote_id).first()
        if fs:
            fs.ga4_csv_filename = None
            fs.ga4_data_json = None
            fs.prophet_forecast_json = None
            fs.prophet_revenue_forecast_json = None
            fs.prophet_fit_json = None
            fs.prophet_revenue_fit_json = None
            fs.prophet_transactions_forecast_json = None
            fs.prophet_transactions_fit_json = None
            fs.ga4_seasonality_json = None
            db.session.commit()
        return {'message': 'GA4 data removed'}


class KeywordsGenerateAPI(Resource):
    """Generowanie słów kluczowych za pomocą Gemini AI."""

    def post(self):
        data = request.get_json() or {}
        domain = (data.get('domain') or '').strip()
        description = (data.get('description') or '').strip()

        if not description:
            return {'error': 'Podaj opis biznesu klienta'}, 400

        if not config.GEMINI_API_KEY:
            return {'error': 'Brak GEMINI_API_KEY w .env'}, 500

        prompt = (
            f"Jesteś ekspertem SEO. Klient prowadzi biznes w domenie: {domain or 'nie podano'}.\n"
            f"Opis biznesu klienta: {description}\n\n"
            f"Wygeneruj listę 20-50 słów kluczowych (fraz), które potencjalni klienci mogą wpisywać w Google, "
            f"szukając produktów lub usług tego biznesu. Uwzględnij frazy informacyjne, transakcyjne i lokalne.\n\n"
            f"WAŻNE: Zwróć WYŁĄCZNIE słowa kluczowe, jedno na linię. Bez numeracji, bez komentarzy, bez nagłówków."
        )

        try:
            import google.generativeai as genai
            genai.configure(api_key=config.GEMINI_API_KEY)
            model = genai.GenerativeModel('gemini-2.5-flash')
            response = model.generate_content(prompt)
            text = response.text.strip()

            keywords = [line.strip() for line in text.split('\n') if line.strip()]
            return {'keywords': keywords}
        except Exception as e:
            return {'error': f'Błąd Gemini API: {str(e)}'}, 500


class KeywordsEnrichAPI(Resource):
    """Wzbogacanie listy słów kluczowych o wolumen i CPC z Ahrefs Keywords Explorer."""

    def post(self):
        data = request.get_json() or {}
        keywords = data.get('keywords') or []

        if not isinstance(keywords, list) or not keywords:
            return {'error': 'Podaj listę słów kluczowych (keywords: [...])'}, 400

        cleaned = [str(kw).strip() for kw in keywords if str(kw).strip()]
        if not cleaned:
            return {'error': 'Lista słów kluczowych jest pusta'}, 400

        if len(cleaned) > 500:
            return {'error': f'Maksymalnie 500 fraz (otrzymano {len(cleaned)})'}, 400

        warnings = []

        if not ahrefs_api_client.enabled:
            warnings.append('Ahrefs jest wyłączony — CPC i wolumen nie zostaną pobrane.')
            results = [
                {"keyword": kw, "monthly_searches": None, "cpc": None, "difficulty": None, "intent": None, "source": "unknown"}
                for kw in cleaned
            ]
            return {'keywords': results, 'warnings': warnings}

        usd_pln = data.get('usd_pln_rate')
        kwargs = {}
        if usd_pln and isinstance(usd_pln, (int, float)) and usd_pln > 0:
            kwargs['usd_pln_rate'] = float(usd_pln)

        try:
            results = ahrefs_api_client.get_keywords_metrics(cleaned, country="pl", **kwargs)
        except AhrefsApiError as exc:
            warnings.append(f'Ahrefs Keywords Explorer: {exc}')
            results = [
                {"keyword": kw, "monthly_searches": None, "cpc": None, "difficulty": None, "intent": None, "source": "unknown"}
                for kw in cleaned
            ]

        unknown_count = sum(1 for r in results if r.get("source") == "unknown")
        if unknown_count:
            warnings.append(
                f'Brak danych z Ahrefs dla {unknown_count}/{len(results)} fraz — uzupełnij CPC i wolumen ręcznie.'
            )

        return {'keywords': results, 'warnings': warnings}


class GoogleAdsAPI(Resource):
    """Zapis i odczyt planera Google Ads dla wyceny."""

    def get(self, quote_id):
        Quote.query.get_or_404(quote_id)
        settings = GoogleAdsSettings.query.filter_by(quote_id=quote_id).first()
        if not settings:
            return {'google_ads_settings': None}
        return {'google_ads_settings': settings.to_dict()}

    def post(self, quote_id):
        Quote.query.get_or_404(quote_id)
        data = request.get_json() or {}

        settings = GoogleAdsSettings.query.filter_by(quote_id=quote_id).first()
        if not settings:
            settings = GoogleAdsSettings(quote_id=quote_id)
            db.session.add(settings)

        if 'media_budget' in data:
            mb = data.get('media_budget')
            settings.media_budget = float(mb) if mb is not None and mb != '' else None

        if 'business_description' in data:
            settings.business_description = str(data.get('business_description') or '')

        if 'ctr' in data:
            settings.ctr = float(data.get('ctr') or 4)

        if 'safety_factor' in data:
            settings.safety_factor = float(data.get('safety_factor') or 1.2)

        if 'manual_clicks' in data:
            mc = data.get('manual_clicks')
            settings.manual_clicks = float(mc) if mc is not None and mc != '' else None

        if 'usd_pln_rate' in data:
            settings.usd_pln_rate = float(data.get('usd_pln_rate') or 3.64)

        if 'product_enabled' in data:
            settings.product_enabled = bool(data.get('product_enabled'))

        for _f in ('product_target_revenue', 'product_target_roas', 'product_cpc', 'product_cvr'):
            if _f in data:
                _v = data.get(_f)
                setattr(settings, _f, float(_v) if _v is not None and _v != '' else None)

        keywords = data.get('keywords')
        if keywords is not None:
            if not isinstance(keywords, list):
                return {'error': 'keywords musi być listą'}, 400
            settings.keywords_json = json.dumps(keywords, ensure_ascii=False)

        db.session.commit()
        return {'message': 'Google Ads settings saved', 'google_ads_settings': settings.to_dict()}


class BrandBriefAPI(Resource):
    """Generowanie briefu marki za pomocą Gemini AI — wieloźródłowe podejście."""

    MAX_PAGE_CHARS = 10000

    @staticmethod
    def _scrape_page(url: str) -> str:
        """Pobiera treść strony przez Jina Reader API (renderuje JS)."""
        try:
            headers = {"Accept": "text/markdown"}
            if config.JINA_API_KEY:
                headers["Authorization"] = f"Bearer {config.JINA_API_KEY}"
            resp = http_requests.get(
                f"https://r.jina.ai/{url}",
                headers=headers,
                timeout=25,
            )
            if resp.status_code == 200 and len(resp.text.strip()) > 100:
                return resp.text.strip()
        except Exception as exc:
            print(f"⚠️  BrandBrief: nie udało się pobrać {url}: {exc}")
        return ""

    def _fetch_site_content(self, domain: str) -> dict:
        """Pobiera treść strony głównej, O nas, i dodatkowe źródła."""
        result = {"homepage": "", "about": "", "krs_info": ""}

        homepage = self._scrape_page(f"https://{domain}")
        if homepage:
            if len(homepage) > self.MAX_PAGE_CHARS:
                homepage = homepage[:self.MAX_PAGE_CHARS] + "\n[...skrócono]"
            result["homepage"] = homepage

        about_paths = ["/o-nas", "/o-firmie", "/about", "/about-us", "/kim-jestesmy", "/o-marce"]
        for path in about_paths:
            about = self._scrape_page(f"https://{domain}{path}")
            if about:
                if len(about) > self.MAX_PAGE_CHARS:
                    about = about[:self.MAX_PAGE_CHARS] + "\n[...skrócono]"
                result["about"] = about
                break

        krs_info = self._fetch_krs_info(domain)
        if krs_info:
            result["krs_info"] = krs_info

        return result

    @staticmethod
    def _fetch_krs_info(domain: str) -> str:
        """Pobiera dane KRS z oficjalnego API MS + szuka przychodów przez Jina Search."""
        clean = domain.replace("www.", "").replace(".pl", "").replace(".com", "").replace(".eu", "").lower()
        parts = []

        # 1) Szukaj numeru KRS przez Jina Search
        krs_number = None
        rejestr_io_url = ""
        if config.JINA_API_KEY:
            try:
                headers = {"Accept": "application/json", "Authorization": f"Bearer {config.JINA_API_KEY}"}
                resp = http_requests.get(
                    f"https://s.jina.ai/{clean}+sp+z+o.o.+KRS+rejestr.io",
                    headers=headers, timeout=20,
                )
                if resp.status_code == 200:
                    for r in resp.json().get("data", []):
                        url = r.get("url", "")
                        if "rejestr.io/krs/" in url and "/krs?" not in url:
                            import re
                            m = re.search(r'/krs/(\d+)', url)
                            if m:
                                krs_number = m.group(1)
                                rejestr_io_url = url.split("?")[0]
                                break
                        content = r.get("content", "") + r.get("description", "")
                        if "przychod" in content.lower() or "zysk" in content.lower() or "revenue" in content.lower():
                            snippet = content[:1500]
                            parts.append(f"[Dane finansowe z sieci]\n{snippet}")
            except Exception as exc:
                print(f"⚠️  BrandBrief KRS search: {exc}")

        # 2) Pobierz dane z oficjalnego API KRS (api-krs.ms.gov.pl)
        if krs_number:
            print(f"📡 BrandBrief: znaleziono KRS {krs_number}, pobieram z API MS...")
            try:
                resp = http_requests.get(
                    f"https://api-krs.ms.gov.pl/api/krs/OdpisPelny/{krs_number}?rejestr=P&format=json",
                    timeout=15,
                )
                if resp.status_code == 200:
                    dane = resp.json().get("odpis", {}).get("dane", {})
                    dzial1 = dane.get("dzial1", {})
                    dzial3 = dane.get("dzial3", {})

                    dp = dzial1.get("danePodmiotu", {})
                    nazwa_list = dp.get("nazwa", [])
                    nazwa = nazwa_list[-1].get("nazwa", "") if nazwa_list else ""

                    ident_list = dp.get("identyfikatory", [])
                    nip = ""
                    regon = ""
                    if ident_list:
                        last_id = ident_list[-1].get("identyfikatory", {})
                        nip = last_id.get("nip", "")
                        regon = last_id.get("regon", "")

                    adr = dzial1.get("siedzibaIAdres", {}).get("adres", [])
                    adres_str = ""
                    if adr:
                        a = adr[-1]
                        adres_str = f"{a.get('ulica','')} {a.get('nrDomu','')}, {a.get('kodPocztowy','')} {a.get('miejscowosc','')}"

                    kap = dzial1.get("kapital", {}).get("wysokoscKapitaluZakladowego", [])
                    kapital = kap[-1].get("wartosc", "") + " " + kap[-1].get("waluta", "") if kap else ""

                    pkd_glowne = dzial3.get("przedmiotPrzewazajacejDzialalnosci", [])
                    pkd_str = ""
                    if pkd_glowne:
                        poz = pkd_glowne[-1].get("pozycja", [])
                        if poz:
                            p = poz[-1]
                            pkd_str = f"{p.get('kodDzial','')}.{p.get('kodKlasa','')}.{p.get('kodPodklasa','')} — {p.get('opis','')}"

                    wzmianki = dzial3.get("wzmiankiOZlozonychDokumentach", {})
                    spraw = wzmianki.get("wzmiankaOZlozeniuRocznegoSprawozdaniaFinansowego", [])
                    ostatnie_spraw = ""
                    if spraw:
                        last = spraw[-1].get("pozycja", [])
                        if last:
                            ostatnie_spraw = f"Ostatnie sprawozdanie: {last[-1].get('zaOkresOdDo','')}, złożone {last[-1].get('dataZlozenia','')}"

                    rejestr_link = rejestr_io_url or f"https://rejestr.io/krs/{krs_number}"
                    krs_text = (
                        f"Nazwa pełna: {nazwa}\n"
                        f"KRS: {krs_number}\n"
                        f"NIP: {nip}\n"
                        f"REGON: {regon}\n"
                        f"Adres: {adres_str}\n"
                        f"Kapitał zakładowy: {kapital}\n"
                        f"PKD (główne): {pkd_str}\n"
                        f"{ostatnie_spraw}\n"
                        f"Link do pełnych danych finansowych: {rejestr_link}/finanse"
                    )
                    parts.insert(0, f"[Oficjalne API KRS — Ministerstwo Sprawiedliwości]\n{krs_text}")
            except Exception as exc:
                print(f"⚠️  BrandBrief KRS API: {exc}")

        # 3) Szukaj przychodów w sieci jeśli jeszcze nie mamy
        if not any("przychod" in p.lower() for p in parts) and config.JINA_API_KEY:
            try:
                headers = {"Accept": "application/json", "Authorization": f"Bearer {config.JINA_API_KEY}"}
                resp = http_requests.get(
                    f"https://s.jina.ai/{clean}+przychody+wyniki+finansowe+mln",
                    headers=headers, timeout=20,
                )
                if resp.status_code == 200:
                    for r in resp.json().get("data", [])[:3]:
                        content = r.get("content", "")
                        desc = r.get("description", "")
                        title = r.get("title", "")
                        combined = f"{title}\n{desc}\n{content}"
                        if any(kw in combined.lower() for kw in ["przychod", "zysk", "revenue", "mln", "tys"]):
                            snippet = combined[:1200]
                            parts.append(f"[Wynik wyszukiwania: {title}]\n{snippet}")
                            break
            except Exception as exc:
                print(f"⚠️  BrandBrief financial search: {exc}")

        if not parts:
            print(f"⚠️  BrandBrief: nie znaleziono danych KRS/finansowych dla {domain}")

        return "\n\n".join(parts)

    def post(self):
        data = request.get_json() or {}
        domain = (data.get('domain') or '').strip()

        if not domain:
            return {'error': 'Podaj domenę (nazwę wyceny)'}, 400

        if not config.GEMINI_API_KEY:
            return {'error': 'Brak GEMINI_API_KEY w .env'}, 500

        content = self._fetch_site_content(domain)
        total_chars = sum(len(v) for v in content.values())
        print(f"📡 BrandBrief: pobrano {total_chars} znaków (strona: {len(content['homepage'])}, o-nas: {len(content['about'])}, krs: {len(content['krs_info'])})")

        ctx_homepage = ""
        if content["homepage"]:
            ctx_homepage = f"\n--- STRONA GŁÓWNA {domain} (wyrenderowana) ---\n{content['homepage']}\n--- KONIEC STRONY GŁÓWNEJ ---\n"

        ctx_about = ""
        if content["about"]:
            ctx_about = f"\n--- PODSTRONA O FIRMIE ---\n{content['about']}\n--- KONIEC PODSTRONY ---\n"

        ctx_krs = ""
        if content["krs_info"]:
            ctx_krs = f"\n--- DANE Z REJESTRU KRS (rejestr.io) ---\n{content['krs_info']}\n--- KONIEC DANYCH KRS ---\n"

        prompt = f"""Jesteś ekspertem SEO i strategiem marketingowym. Przygotowujesz brief o firmie: {domain}

DANE ŹRÓDŁOWE:
{ctx_homepage}
{ctx_about}
{ctx_krs}

INSTRUKCJE DLA KAŻDEJ SEKCJI — każda sekcja ma INNE zasady:

1. "company_info" — OPIERAJ SIĘ NA STRONIE. Opisz co firma sprzedaje, najważniejsze kategorie produktów, marki w ofercie, kraje/rynki. Wymień konkretne produkty/kategorie widoczne na stronie.

2. "personas" — WNIOSKUJ NA PODSTAWIE OFERTY. Na podstawie tego co firma sprzedaje, kim są typowi klienci? Wymień 3-5 person zakupowych z krótkim opisem (kim jest, czego szuka, jaki ma budżet). Nikt nie podaje person na stronie — to Twoja analiza ekspercka na podstawie oferty.

3. "usp" — WNIOSKUJ Z TREŚCI STRONY. Na podstawie tego co firma komunikuje (hasła, opisy, wartości) — jakie są ich przewagi konkurencyjne i USP? Czym się wyróżniają? Przeanalizuj język i treści na stronie.

4. "channels" — ANALIZUJ STRONĘ + WNIOSKUJ. Sprawdź kody śledzenia (Google Ads, Facebook Pixel, GTM), linki do social media, informacje o sklepach stacjonarnych, marketplace'ach. Jeśli widzisz ślady kampanii remarketingowych, napisz o tym.

5. "reviews" — UŻYJ SWOJEJ WIEDZY. Jaki jest ogólny sentyment o tej marce w internecie? Co ludzie chwalą, na co narzekają? Skorzystaj ze swojej wiedzy o opinich o marce {domain}. Bądź konkretny — podaj typowe opinie.

6. "seasonality" — WNIOSKUJ Z KATEGORII. Na podstawie kategorii produktów ze strony, określ sezonowość: które kategorie mają szczyty sprzedaży i kiedy. Np. plecaki szkolne = sierpień/wrzesień, walizki = czerwiec/lipiec. Podaj konkretne miesiące dla każdej głównej kategorii.

7. "site_structure" — OPISZ NA PODSTAWIE WYRENDEROWANEJ STRONY. Wymień główne kategorie z menu/nawigacji, czy jest blog, podkategorie, filtry. Opisz strukturę URL jeśli widoczna.

8. "revenue" — UŻYJ DANYCH Z KRS. Podaj NIP, numer KRS, kapitał zakładowy i datę ostatniego sprawozdania. KONIECZNIE podaj link do strony z danymi finansowymi (rejestr.io) — skopiuj go dokładnie z danych KRS powyżej. Format: "Pełne dane finansowe: [link]". Jeśli w danych są kwoty przychodów, podaj je.

WAŻNE:
- Odpowiedz WYŁĄCZNIE jako poprawny JSON (bez markdown, bez ```json```).
- Każda wartość to tekst po polsku.
- Możesz używać \\n dla nowych linii wewnątrz wartości.
- Bądź konkretny i podawaj przykłady z danych gdy to możliwe.
- NIE mieszaj z innymi firmami — analizujesz DOKŁADNIE {domain}.

Odpowiedz TYLKO poprawnym JSON-em z 8 kluczami."""

        try:
            import google.generativeai as genai
            genai.configure(api_key=config.GEMINI_API_KEY)
            model = genai.GenerativeModel('gemini-2.5-flash')
            response = model.generate_content(prompt)
            text = response.text.strip()

            if text.startswith('```'):
                text = text.split('\n', 1)[1] if '\n' in text else text[3:]
                if text.endswith('```'):
                    text = text[:-3].strip()

            import json as json_mod
            try:
                brief = json_mod.loads(text)
            except json_mod.JSONDecodeError:
                brief = {"company_info": text}

            return {'brief': brief}
        except Exception as e:
            return {'error': f'Błąd Gemini API: {str(e)}'}, 500


class EstimationSuggestAPI(Resource):
    """AI sugestia Konwersji, AOV i Marży na podstawie opisu firmy."""

    def post(self):
        data = request.get_json() or {}
        company_info = (data.get('company_info') or '').strip()

        if not company_info:
            return {'error': 'Brak opisu firmy (company_info)'}, 400
        if not config.GEMINI_API_KEY:
            return {'error': 'Brak GEMINI_API_KEY'}, 500

        prompt = f"""Na podstawie opisu firmy, zaproponuj realistyczne wartości dla estymacji SEO e-commerce.

OPIS FIRMY:
{company_info}

Zwróć WYŁĄCZNIE poprawny JSON (bez markdown) z 3 kluczami:
1. "conversion_rate" — współczynnik konwersji w % (typowo 0.5-5% dla e-commerce, zależy od branży). Podaj liczbę.
2. "aov" — średnia wartość zamówienia (AOV) w PLN. Oszacuj na podstawie typowych produktów tej firmy. Podaj liczbę.
3. "margin" — marża w % (typowo 5-60%, zależy od branży). Podaj liczbę.

Dla każdej wartości dodaj krótkie uzasadnienie w osobnym kluczu:
4. "conversion_rate_reason" — dlaczego taka konwersja (1 zdanie)
5. "aov_reason" — dlaczego takie AOV (1 zdanie)
6. "margin_reason" — dlaczego taka marża (1 zdanie)

Odpowiedz TYLKO JSON-em."""

        try:
            import google.generativeai as genai
            genai.configure(api_key=config.GEMINI_API_KEY)
            model = genai.GenerativeModel('gemini-2.5-flash')
            response = model.generate_content(prompt)
            text = response.text.strip()

            if text.startswith('```'):
                text = text.split('\n', 1)[1] if '\n' in text else text[3:]
                if text.endswith('```'):
                    text = text[:-3].strip()

            result = json.loads(text)
            return {'suggestion': result}
        except json.JSONDecodeError:
            return {'error': 'Gemini nie zwróciło poprawnego JSON'}, 500
        except Exception as e:
            return {'error': f'Błąd Gemini API: {str(e)}'}, 500


class QuoteBriefAPI(Resource):
    """Zapis i odczyt briefu marki dla wyceny."""

    def get(self, quote_id):
        quote = Quote.query.get_or_404(quote_id)
        if quote.brief_json:
            return {'brief': json.loads(quote.brief_json)}
        return {'brief': None}

    def post(self, quote_id):
        quote = Quote.query.get_or_404(quote_id)
        data = request.get_json() or {}
        brief = data.get('brief')
        if brief:
            quote.brief_json = json.dumps(brief, ensure_ascii=False)
            db.session.commit()
        return {'status': 'ok'}


# Register API resources
api.add_resource(PricelistAPI, '/api/pricelist', '/api/pricelist/<int:item_id>')
api.add_resource(QuotesAPI, '/api/quotes', '/api/quotes/<int:quote_id>')
api.add_resource(QuoteItemsAPI, '/api/quotes/<int:quote_id>/items', '/api/quotes/<int:quote_id>/items/<int:item_id>')
api.add_resource(DefaultTasksAPI, '/api/default-tasks', '/api/default-tasks/<int:task_id>')
api.add_resource(ExportAPI, '/api/quotes/<int:quote_id>/export')
api.add_resource(CompetitorsAPI, '/api/quotes/<int:quote_id>/competitors')
api.add_resource(SeoAnalysisAPI, '/api/quotes/<int:quote_id>/seo-analysis')
api.add_resource(SeoAnalysisExportAPI, '/api/quotes/<int:quote_id>/seo-analysis/export')
api.add_resource(ForecastSeasonalityAPI, '/api/quotes/<int:quote_id>/forecast/seasonality')
api.add_resource(ForecastAPI, '/api/quotes/<int:quote_id>/forecast')
api.add_resource(GA4UploadAPI, '/api/quotes/<int:quote_id>/forecast/ga4-upload')
api.add_resource(KeywordsGenerateAPI, '/api/keywords/generate')
api.add_resource(KeywordsEnrichAPI, '/api/keywords/enrich')
api.add_resource(GoogleAdsAPI, '/api/quotes/<int:quote_id>/google-ads')
api.add_resource(BrandBriefAPI, '/api/brand-brief/generate')
api.add_resource(EstimationSuggestAPI, '/api/estimation/suggest')
api.add_resource(QuoteBriefAPI, '/api/quotes/<int:quote_id>/brief')

if __name__ == '__main__':
    app.run(debug=True, port=5002)
