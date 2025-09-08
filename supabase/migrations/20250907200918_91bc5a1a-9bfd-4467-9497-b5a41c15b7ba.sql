-- Create enum types
CREATE TYPE public.bottle_type AS ENUM ('normal', 'cool');
CREATE TYPE public.delivery_type AS ENUM ('daily', 'alternate', 'weekly');
CREATE TYPE public.customer_type AS ENUM ('household', 'shop', 'function');
CREATE TYPE public.payment_type AS ENUM ('cash', 'online', 'credit');
CREATE TYPE public.transaction_type AS ENUM ('delivery', 'return', 'payment');
CREATE TYPE public.staff_role AS ENUM ('owner', 'delivery', 'counter');

-- Customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin VARCHAR(4) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  customer_type customer_type DEFAULT 'household',
  delivery_type delivery_type DEFAULT 'daily',
  route_id UUID,
  balance DECIMAL(10,2) DEFAULT 0,
  deposit_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bottles/Cans tracking
CREATE TABLE public.bottles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bottle_number VARCHAR(10) UNIQUE NOT NULL,
  bottle_type bottle_type DEFAULT 'normal',
  current_customer_id UUID REFERENCES public.customers(id),
  is_returned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Routes for delivery management
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  order_sequence INTEGER[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Staff accounts
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  role staff_role DEFAULT 'delivery',
  route_id UUID REFERENCES public.routes(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pricing configuration
CREATE TABLE public.pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bottle_type bottle_type NOT NULL,
  customer_type customer_type NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(bottle_type, customer_type)
);

-- Transactions (deliveries, returns, payments)
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  staff_id UUID REFERENCES public.staff(id),
  transaction_type transaction_type NOT NULL,
  bottle_type bottle_type,
  quantity INTEGER DEFAULT 0,
  amount DECIMAL(10,2) DEFAULT 0,
  payment_type payment_type,
  bottle_numbers TEXT[], -- Array of bottle numbers involved
  notes TEXT,
  transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Function/Event orders
CREATE TABLE public.function_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  event_name TEXT,
  event_date DATE,
  bottles_supplied INTEGER DEFAULT 0,
  bottles_returned INTEGER DEFAULT 0,
  total_amount DECIMAL(10,2) DEFAULT 0,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  is_settled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update customers table to reference routes
ALTER TABLE public.customers ADD CONSTRAINT fk_customers_route 
FOREIGN KEY (route_id) REFERENCES public.routes(id);

-- Enable Row Level Security
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bottles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.function_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allowing authenticated users to access their data)
CREATE POLICY "Enable read for authenticated users" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON public.customers FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read for authenticated users" ON public.bottles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.bottles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.bottles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON public.bottles FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read for authenticated users" ON public.routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.routes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.routes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON public.routes FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read for authenticated users" ON public.staff FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.staff FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.staff FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON public.staff FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read for authenticated users" ON public.pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.pricing FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.pricing FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON public.pricing FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read for authenticated users" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.transactions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON public.transactions FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read for authenticated users" ON public.function_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.function_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.function_orders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON public.function_orders FOR DELETE TO authenticated USING (true);

-- Create indexes for better performance
CREATE INDEX idx_customers_pin ON public.customers(pin);
CREATE INDEX idx_customers_route ON public.customers(route_id);
CREATE INDEX idx_bottles_number ON public.bottles(bottle_number);
CREATE INDEX idx_bottles_customer ON public.bottles(current_customer_id);
CREATE INDEX idx_transactions_customer ON public.transactions(customer_id);
CREATE INDEX idx_transactions_date ON public.transactions(transaction_date);
CREATE INDEX idx_staff_user_id ON public.staff(user_id);

-- Insert default pricing
INSERT INTO public.pricing (bottle_type, customer_type, price) VALUES
('normal', 'household', 20.00),
('cool', 'household', 25.00),
('normal', 'shop', 18.00),
('cool', 'shop', 23.00),
('normal', 'function', 15.00),
('cool', 'function', 20.00);

-- Functions for automatic updates
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bottles_updated_at BEFORE UPDATE ON public.bottles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_function_orders_updated_at BEFORE UPDATE ON public.function_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate unique PIN for customers
CREATE OR REPLACE FUNCTION public.generate_unique_pin()
RETURNS TEXT AS $$
DECLARE
    new_pin TEXT;
    pin_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate random 4-digit PIN
        new_pin := LPAD(floor(random() * 10000)::text, 4, '0');
        
        -- Check if PIN already exists
        SELECT EXISTS(SELECT 1 FROM public.customers WHERE pin = new_pin) INTO pin_exists;
        
        -- Exit loop if PIN is unique
        IF NOT pin_exists THEN
            EXIT;
        END IF;
    END LOOP;
    
    RETURN new_pin;
END;
$$ LANGUAGE plpgsql;