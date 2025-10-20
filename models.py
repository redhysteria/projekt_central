from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

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

class SeoAnalysis(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quote_id = db.Column(db.Integer, db.ForeignKey('quote.id'), nullable=False)
    domain = db.Column(db.String(255), nullable=False)
    
    # Raw SEO parameters (mockowane dane z Ahrefs)
    domain_rating = db.Column(db.Float, nullable=False, default=0)
    referring_domains = db.Column(db.Integer, nullable=False, default=0)
    top3_keywords = db.Column(db.Integer, nullable=False, default=0)
    top10_keywords = db.Column(db.Integer, nullable=False, default=0)
    top50_keywords = db.Column(db.Integer, nullable=False, default=0)
    urls_in_top10 = db.Column(db.Integer, nullable=False, default=0)
    urls_in_top50 = db.Column(db.Integer, nullable=False, default=0)
    estimated_traffic = db.Column(db.Integer, nullable=False, default=0)
    
    # Calculated values
    avg_kw_per_url = db.Column(db.Float, nullable=False, default=0)  # średnia liczba KW w top10 na URL
    avg_traffic_per_kw = db.Column(db.Float, nullable=False, default=0)  # średni ruch na słowo kluczowe
    
    # Data source
    data_source = db.Column(db.String(50), nullable=False, default='mock')  # 'ahrefs_api' lub 'mock'
    
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
