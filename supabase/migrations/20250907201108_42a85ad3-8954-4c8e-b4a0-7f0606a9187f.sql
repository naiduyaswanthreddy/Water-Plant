-- Fix search path security issue for generate_unique_pin function
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
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;