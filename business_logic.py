from models import db, Quote, QuoteItem, MonthlyDistribution, Pricelist
import re
from month_utils import parse_months_csv, client_month_label_to_csv

class BusinessLogic:
    def __init__(self):
        pass
    
    def generate_auto_items(self, quote_id):
        """Generate automatic items based on quote parameters"""
        quote = Quote.query.get(quote_id)
        if not quote:
            return
        
        # Generate LB marża (15% of LB budget)
        if quote.lb_budget > 0:
            self._create_or_update_auto_item(
                quote_id, 
                'LB marża', 
                'Senior SEO',
                quote.lb_budget * 0.15,
                quote.lb_marza_month or 'Od Miesiąc 02'
            )
        
        # Generate LB budżet mediowy (85% of LB budget)
        if quote.lb_budget > 0:
            self._create_or_update_auto_item(
                quote_id,
                'LB budżet mediowy',
                'Senior SEO', 
                quote.lb_budget * 0.85,
                quote.lb_budzet_month or 'Od Miesiąc 02'
            )
        
        # Generate Napisanie treści
        if (quote.chars_in_thousands > 0 and 
            quote.rate_per_1000_chars > 0 and 
            quote.rate_multiplier > 0 and 
            quote.num_texts > 0):
            
            total_price = (quote.rate_per_1000_chars * 
                          quote.rate_multiplier * 
                          quote.chars_in_thousands * 
                          quote.num_texts)
            
            self._create_or_update_auto_item(
                quote_id,
                f'Napisanie treści ({quote.rate_multiplier}x stawka za 1000 znaków)',
                'Copywriter Content',
                total_price,
                quote.content_month or 'Od Miesiąc 02'
            )
    
    def regenerate_auto_items(self, quote_id):
        """Remove and regenerate auto items when quote parameters change"""
        # Remove existing auto items
        QuoteItem.query.filter_by(quote_id=quote_id, is_auto_generated=True).delete()
        
        # Generate new auto items
        self.generate_auto_items(quote_id)
    
    def _create_or_update_auto_item(self, quote_id, task_name, specialist_type, client_price, client_month):
        """Create or update an auto-generated item"""
        # Check if auto item already exists
        existing_item = QuoteItem.query.filter_by(
            quote_id=quote_id,
            task_name=task_name,
            is_auto_generated=True
        ).first()
        
        if existing_item:
            # Update existing item
            existing_item.client_price = client_price
            existing_item.client_month = client_month
            existing_item.client_months = client_month_label_to_csv(client_month)
            existing_item.specialist_type = specialist_type
            
            # Get price from pricelist
            pricelist_item = Pricelist.query.filter_by(specialist_type=specialist_type).first()
            if pricelist_item:
                existing_item.price_per_unit = pricelist_item.price_per_unit
                
                # Calculate client_units based on unit type
                if pricelist_item.unit_type == 'hour':
                    existing_item.client_units = client_price / pricelist_item.price_per_unit
                else:
                    existing_item.client_units = 1  # For other unit types
        else:
            # Create new item
            pricelist_item = Pricelist.query.filter_by(specialist_type=specialist_type).first()
            price_per_unit = pricelist_item.price_per_unit if pricelist_item else 0
            
            client_units = 1
            if pricelist_item and pricelist_item.unit_type == 'hour':
                client_units = client_price / price_per_unit
            
            new_item = QuoteItem(
                quote_id=quote_id,
                task_name=task_name,
                specialist_type=specialist_type,
                month_execution='',
                hours_or_units=0,
                price_per_unit=price_per_unit,
                total_price=client_price,
                client_units=client_units,
                client_price=client_price,
                client_month=client_month,
                client_months=client_month_label_to_csv(client_month),
                is_auto_generated=True
            )
            db.session.add(new_item)
        
        db.session.commit()
        
        # Generate monthly distribution for auto items
        if existing_item:
            self.generate_monthly_distribution(existing_item.id)
        else:
            # For new items, we need to get the ID after commit
            new_item = QuoteItem.query.filter_by(
                quote_id=quote_id,
                task_name=task_name,
                is_auto_generated=True
            ).first()
            if new_item:
                self.generate_monthly_distribution(new_item.id)
    
    def generate_monthly_distribution(self, quote_item_id):
        """Rozkład jest pochodną client_months — materializacja nieużywana."""
        return

    def regenerate_monthly_distribution(self, quote_item_id):
        """Rozkład jest pochodną client_months — materializacja nieużywana."""
        return
    
    def _parse_client_month(self, client_month):
        """Parse client month string and return list of month numbers (1-12)"""
        if not client_month:
            return []
        
        months = []
        
        # Handle "Miesiąc XX" format
        single_month_match = re.match(r'Miesiąc (\d{1,2})', client_month)
        if single_month_match:
            month_num = int(single_month_match.group(1))
            if 1 <= month_num <= 12:
                months.append(month_num)
            return months
        
        # Handle "Od Miesiąc XX" format
        from_month_match = re.match(r'Od Miesiąc (\d{1,2})', client_month)
        if from_month_match:
            start_month = int(from_month_match.group(1))
            if 1 <= start_month <= 12:
                months = list(range(start_month, 13))  # From start_month to 12
            return months
        
        # Handle "Miesiąc XX-YY" format (for future expansion)
        range_match = re.match(r'Miesiąc (\d{1,2})-(\d{1,2})', client_month)
        if range_match:
            start_month = int(range_match.group(1))
            end_month = int(range_match.group(2))
            if 1 <= start_month <= 12 and 1 <= end_month <= 12 and start_month <= end_month:
                months = list(range(start_month, end_month + 1))
            return months
        
        return months
    
    def calculate_monthly_totals(self, quote_id):
        """Sumy miesięczne z client_months (pełna client_price w każdym miesiącu)."""
        items = QuoteItem.query.filter_by(quote_id=quote_id).all()
        monthly_totals = {month: 0 for month in range(1, 13)}
        for item in items:
            for m in parse_months_csv(item.client_months):
                monthly_totals[m] += (item.client_price or 0)
        return monthly_totals
    
    def calculate_item_totals(self, quote_id):
        """Calculate total for each item (sum of monthly distributions)"""
        items = QuoteItem.query.filter_by(quote_id=quote_id).all()
        item_totals = {}
        
        for item in items:
            distributions = MonthlyDistribution.query.filter_by(quote_item_id=item.id).all()
            total = sum(dist.amount for dist in distributions)
            item_totals[item.id] = total
        
        return item_totals
