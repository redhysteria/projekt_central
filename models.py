from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json

db = SQLAlchemy()

class Pricelist(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    specialist_type = db.Column(db.String(100), nullable=False, unique=True)
    price_per_unit = db.Column(db.Float, nullable=False)
    unit_type = db.Column(db.String(20), nullable=False)  # 'hour', '1000chars', 'piece'
    
    def to_dict(self):
        return {
            'id': self.id,
            'specialist_type': self.specialist_type,
            'price_per_unit': self.price_per_unit,
            'unit_type': self.unit_type
        }

class Quote(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Global parameters for auto-generated items
    lb_budget = db.Column(db.Float, default=0)
    chars_in_thousands = db.Column(db.Float, default=0)
    rate_per_1000_chars = db.Column(db.Float, default=0)
    rate_multiplier = db.Column(db.Float, default=1)
    num_texts = db.Column(db.Integer, default=0)
    
    # Month settings for auto-generated items
    lb_marza_month = db.Column(db.String(50), default='Od Miesiąc 02')
    lb_budzet_month = db.Column(db.String(50), default='Od Miesiąc 02')
    content_month = db.Column(db.String(50), default='Od Miesiąc 02')

    brief_json = db.Column(db.Text, nullable=True, default=None)
    
    # Relationship
    items = db.relationship('QuoteItem', backref='quote', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'lb_budget': self.lb_budget,
            'chars_in_thousands': self.chars_in_thousands,
            'rate_per_1000_chars': self.rate_per_1000_chars,
            'rate_multiplier': self.rate_multiplier,
            'num_texts': self.num_texts,
            'lb_marza_month': self.lb_marza_month,
            'lb_budzet_month': self.lb_budzet_month,
            'content_month': self.content_month,
            'total_value': sum(item.client_price for item in self.items)
        }

class QuoteItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quote_id = db.Column(db.Integer, db.ForeignKey('quote.id'), nullable=False)
    
    task_name = db.Column(db.String(200), nullable=False)
    specialist_type = db.Column(db.String(100), nullable=False)
    month_execution = db.Column(db.String(50), default='')  # Suggested month (not used in calculations)
    
    # Internal calculation fields
    hours_or_units = db.Column(db.Float, default=0)
    price_per_unit = db.Column(db.Float, default=0)
    total_price = db.Column(db.Float, default=0)
    
    # Client-facing fields
    client_units = db.Column(db.Float, default=0)  # Units for client (j.m. - klient)
    client_price = db.Column(db.Float, default=0)  # Price for client (cena na projekt - klient)
    client_month = db.Column(db.String(50), default='')  # Client execution month
    
    # Auto-generated flag
    is_auto_generated = db.Column(db.Boolean, default=False)
    
    # Relationship
    monthly_distributions = db.relationship('MonthlyDistribution', backref='quote_item', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'quote_id': self.quote_id,
            'task_name': self.task_name,
            'specialist_type': self.specialist_type,
            'month_execution': self.month_execution,
            'hours_or_units': self.hours_or_units,
            'price_per_unit': self.price_per_unit,
            'total_price': self.total_price,
            'client_units': self.client_units,
            'client_price': self.client_price,
            'client_month': self.client_month,
            'is_auto_generated': self.is_auto_generated,
            'monthly_distribution': {
                dist.month_number: dist.amount 
                for dist in self.monthly_distributions
            }
        }

class MonthlyDistribution(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quote_item_id = db.Column(db.Integer, db.ForeignKey('quote_item.id'), nullable=False)
    month_number = db.Column(db.Integer, nullable=False)  # 1-12
    amount = db.Column(db.Float, default=0)
    
    # Unique constraint to prevent duplicate month entries for same item
    __table_args__ = (db.UniqueConstraint('quote_item_id', 'month_number', name='_quote_item_month_uc'),)
    
    def to_dict(self):
        return {
            'id': self.id,
            'quote_item_id': self.quote_item_id,
            'month_number': self.month_number,
            'amount': self.amount
        }

class DefaultTask(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_name = db.Column(db.String(200), nullable=False)
    specialist_type = db.Column(db.String(100), nullable=False)
    month_execution = db.Column(db.String(50), default='')  # Suggested month
    hours_or_units = db.Column(db.Float, default=0)
    price_per_unit = db.Column(db.Float, default=0)
    total_price = db.Column(db.Float, default=0)
    client_units = db.Column(db.Float, default=0)
    client_price = db.Column(db.Float, default=0)
    client_month = db.Column(db.String(50), default='')
    
    def to_dict(self):
        return {
            'id': self.id,
            'task_name': self.task_name,
            'specialist_type': self.specialist_type,
            'month_execution': self.month_execution,
            'hours_or_units': self.hours_or_units,
            'price_per_unit': self.price_per_unit,
            'total_price': self.total_price,
            'client_units': self.client_units,
            'client_price': self.client_price,
            'client_month': self.client_month
        }

class Competitor(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quote_id = db.Column(db.Integer, db.ForeignKey('quote.id'), nullable=False)
    domain = db.Column(db.String(255), nullable=False)
    occurrences = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship
    quote = db.relationship('Quote', backref='competitors')
    
    def to_dict(self):
        return {
            'id': self.id,
            'quote_id': self.quote_id,
            'domain': self.domain,
            'occurrences': self.occurrences,
            'created_at': self.created_at.isoformat()
        }

class ForecastSettings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quote_id = db.Column(db.Integer, db.ForeignKey('quote.id'), unique=True, nullable=False)
    client_domain = db.Column(db.String(255), default='')
    leader_domain = db.Column(db.String(255), default='')
    conversion_rate = db.Column(db.Float, default=0.018)
    aov = db.Column(db.Float, default=0)
    margin = db.Column(db.Float, default=0.15)
    fixed_seo_budget = db.Column(db.Float, default=0)
    monthly_content_volume = db.Column(db.Integer, default=0)
    lb_rate_override = db.Column(db.Float, nullable=True, default=None)
    lb_cost_override = db.Column(db.Float, nullable=True, default=None)
    seasonality_json = db.Column(db.Text, default='')
    forecast_json = db.Column(db.Text, default='')
    ga4_csv_filename = db.Column(db.String(255), nullable=True, default=None)
    ga4_data_json = db.Column(db.Text, nullable=True, default=None)
    prophet_forecast_json = db.Column(db.Text, nullable=True, default=None)
    ga4_seasonality_json = db.Column(db.Text, nullable=True, default=None)
    prophet_revenue_forecast_json = db.Column(db.Text, nullable=True, default=None)
    prophet_fit_json = db.Column(db.Text, nullable=True, default=None)
    prophet_revenue_fit_json = db.Column(db.Text, nullable=True, default=None)
    prophet_transactions_forecast_json = db.Column(db.Text, nullable=True, default=None)
    prophet_transactions_fit_json = db.Column(db.Text, nullable=True, default=None)
    no_effect_months = db.Column(db.Integer, nullable=False, default=2)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    quote = db.relationship('Quote', backref=db.backref('forecast_settings', uselist=False))

    def to_dict(self):
        return {
            'id': self.id,
            'quote_id': self.quote_id,
            'client_domain': self.client_domain,
            'leader_domain': self.leader_domain,
            'conversion_rate': self.conversion_rate,
            'aov': self.aov,
            'margin': self.margin,
            'fixed_seo_budget': self.fixed_seo_budget,
            'monthly_content_volume': self.monthly_content_volume,
            'lb_rate_override': self.lb_rate_override,
            'lb_cost_override': self.lb_cost_override,
            'seasonality_json': self.seasonality_json,
            'forecast_json': self.forecast_json,
            'ga4_csv_filename': self.ga4_csv_filename,
            'ga4_data_json': self.ga4_data_json,
            'prophet_forecast_json': self.prophet_forecast_json,
            'ga4_seasonality_json': self.ga4_seasonality_json,
            'prophet_revenue_forecast_json': self.prophet_revenue_forecast_json,
            'prophet_fit_json': self.prophet_fit_json,
            'prophet_revenue_fit_json': self.prophet_revenue_fit_json,
            'prophet_transactions_forecast_json': self.prophet_transactions_forecast_json,
            'prophet_transactions_fit_json': self.prophet_transactions_fit_json,
            'no_effect_months': self.no_effect_months,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class GoogleAdsSettings(db.Model):
    """Ustawienia planera Google Ads powiązane z wyceną."""
    id = db.Column(db.Integer, primary_key=True)
    quote_id = db.Column(db.Integer, db.ForeignKey('quote.id'), unique=True, nullable=False)
    media_budget = db.Column(db.Float, nullable=True, default=None)
    business_description = db.Column(db.Text, default='')
    ctr = db.Column(db.Float, default=4.0)
    safety_factor = db.Column(db.Float, default=1.2)
    manual_clicks = db.Column(db.Float, nullable=True, default=None)
    usd_pln_rate = db.Column(db.Float, default=3.64)
    product_enabled = db.Column(db.Boolean, default=False)
    product_target_revenue = db.Column(db.Float, nullable=True, default=None)
    product_target_roas = db.Column(db.Float, default=4.0)
    product_cpc = db.Column(db.Float, nullable=True, default=None)
    product_cvr = db.Column(db.Float, nullable=True, default=None)
    keywords_json = db.Column(db.Text, default='[]')
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    quote = db.relationship('Quote', backref=db.backref('google_ads_settings', uselist=False))

    def to_dict(self):
        try:
            keywords = json.loads(self.keywords_json) if self.keywords_json else []
        except (json.JSONDecodeError, TypeError):
            keywords = []
        if not isinstance(keywords, list):
            keywords = []
        return {
            'id': self.id,
            'quote_id': self.quote_id,
            'media_budget': self.media_budget,
            'business_description': self.business_description or '',
            'ctr': self.ctr if self.ctr is not None else 4.0,
            'safety_factor': self.safety_factor if self.safety_factor is not None else 1.2,
            'manual_clicks': self.manual_clicks,
            'usd_pln_rate': self.usd_pln_rate if self.usd_pln_rate is not None else 3.64,
            'keywords': keywords,
            'product_enabled': bool(self.product_enabled),
            'product_target_revenue': self.product_target_revenue,
            'product_target_roas': self.product_target_roas if self.product_target_roas is not None else 4.0,
            'product_cpc': self.product_cpc,
            'product_cvr': self.product_cvr,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class SeoAnalysis(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quote_id = db.Column(db.Integer, db.ForeignKey('quote.id'), nullable=False)
    domain = db.Column(db.String(255), nullable=False)
    
    # Raw SEO parameters
    # Ahrefs API v3: domain_rating, referring_domains, backlinks
    # Senuto API:    top3/top10/top50, urls_in_top10/50, estimated_traffic
    domain_rating = db.Column(db.Float, nullable=False, default=0)
    referring_domains = db.Column(db.Integer, nullable=False, default=0)
    backlinks = db.Column(db.Integer, nullable=False, default=0)
    top3_keywords = db.Column(db.Integer, nullable=False, default=0)
    top10_keywords = db.Column(db.Integer, nullable=False, default=0)
    top50_keywords = db.Column(db.Integer, nullable=False, default=0)
    urls_in_top10 = db.Column(db.Integer, nullable=False, default=0)
    urls_in_top50 = db.Column(db.Integer, nullable=False, default=0)
    estimated_traffic = db.Column(db.Integer, nullable=False, default=0)

    avg_kw_per_url = db.Column(db.Float, nullable=False, default=0)
    avg_traffic_per_kw = db.Column(db.Float, nullable=False, default=0)

    # 'senuto+ahrefs', 'senuto', 'ahrefs_api', 'ahrefs_mock'
    data_source = db.Column(db.String(50), nullable=False, default='unknown')
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship
    quote = db.relationship('Quote', backref='seo_analyses')
    
    def to_dict(self):
        return {
            'id': self.id,
            'quote_id': self.quote_id,
            'domain': self.domain,
            'domain_rating': self.domain_rating,
            'referring_domains': self.referring_domains,
            'backlinks': self.backlinks,
            'top3_keywords': self.top3_keywords,
            'top10_keywords': self.top10_keywords,
            'top50_keywords': self.top50_keywords,
            'urls_in_top10': self.urls_in_top10,
            'urls_in_top50': self.urls_in_top50,
            'estimated_traffic': self.estimated_traffic,
            'avg_kw_per_url': self.avg_kw_per_url,
            'avg_traffic_per_kw': self.avg_traffic_per_kw,
            'data_source': self.data_source,
            'created_at': self.created_at.isoformat()
        }
