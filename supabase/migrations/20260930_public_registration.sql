BEGIN;
CREATE TABLE IF NOT EXISTS public.business_registration_links (
 business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
 public_code uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.business_registration_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_registration_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_registration_links TO service_role;
INSERT INTO public.business_registration_links(business_id) SELECT id FROM public.businesses ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.initialize_business_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.business_registration_links(business_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.initialize_business_registration() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS business_registration_created ON public.businesses;
CREATE TRIGGER business_registration_created AFTER INSERT ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.initialize_business_registration();

CREATE OR REPLACE FUNCTION public.get_business_registration(target_business_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR (NOT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=auth.uid()) AND NOT EXISTS(
 SELECT 1 FROM public.business_members WHERE business_id=target_business_id AND user_id=auth.uid() AND active AND role IN ('owner','staff'))) THEN
 RAISE EXCEPTION 'No tienes acceso al QR de este negocio.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('business_id',b.id,'name',b.name,'code',l.public_code) INTO result
 FROM public.businesses b JOIN public.business_registration_links l ON l.business_id=b.id WHERE b.id=target_business_id AND b.active;
 IF result IS NULL THEN RAISE EXCEPTION 'El negocio no está disponible.'; END IF;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.get_business_registration(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_business_registration(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.customer_registration_requests (
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
 client_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(business_id,request_id)
);
CREATE INDEX IF NOT EXISTS customer_registration_rate ON public.customer_registration_requests(business_id,created_at);
ALTER TABLE public.customer_registration_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_registration_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.customer_registration_requests TO service_role;

-- Only the Edge Function may call this: anonymous users cannot bypass validation/rate limits.
CREATE OR REPLACE FUNCTION public.register_public_customer(registration_code uuid, request_key uuid, client_hash_value text, customer_name text, customer_email text DEFAULT NULL, customer_phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bid uuid; existing_id uuid; created_id uuid; token uuid; nm text:=btrim(coalesce(customer_name,'')); em text:=nullif(lower(btrim(customer_email)),''); ph text:=nullif(btrim(customer_phone),'');
BEGIN
 IF request_key IS NULL OR client_hash_value IS NULL OR client_hash_value !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
 IF length(nm)<2 OR length(nm)>100 THEN RAISE EXCEPTION 'Escribe un nombre de 2 a 100 caracteres.'; END IF;
 IF em IS NOT NULL AND (length(em)>254 OR em !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'El correo no es válido.'; END IF;
 IF ph IS NOT NULL AND (length(ph)>30 OR ph !~ '^[+0-9() .-]+$' OR length(regexp_replace(ph,'[^0-9]','','g')) NOT BETWEEN 7 AND 15) THEN RAISE EXCEPTION 'El teléfono no es válido.'; END IF;
 -- Serialize registrations within the business: retries and concurrent requests share the same limits.
 SELECT b.id INTO bid FROM public.businesses b JOIN public.business_registration_links l ON b.id=l.business_id WHERE l.public_code=registration_code AND b.active FOR UPDATE OF b;
 IF bid IS NULL THEN RAISE EXCEPTION 'Registro no disponible para este negocio.'; END IF;
 SELECT customer_id INTO existing_id FROM public.customer_registration_requests WHERE business_id=bid AND request_id=request_key;
 IF existing_id IS NOT NULL THEN
  SELECT qr_token INTO token FROM public.customers WHERE id=existing_id AND business_id=bid AND active;
  IF token IS NULL THEN RAISE EXCEPTION 'Esta tarjeta ya no está disponible. Consulta al negocio.'; END IF;
  RETURN jsonb_build_object('token',token,'created',false);
 END IF;
 -- Short-lived anti-abuse log; never removes customers or visits.
 DELETE FROM public.customer_registration_requests WHERE business_id=bid AND created_at<now()-interval '7 days';
 IF (SELECT count(*) FROM public.customer_registration_requests WHERE business_id=bid AND created_at>now()-interval '1 hour')>=300 OR
 (SELECT count(*) FROM public.customer_registration_requests WHERE business_id=bid AND client_hash=client_hash_value AND created_at>now()-interval '10 minutes')>=30 THEN
 RAISE EXCEPTION 'Hay muchos registros recientes. Intenta más tarde o pide ayuda al personal.';
 END IF;
 INSERT INTO public.customers(business_id,name,email,phone,active) VALUES(bid,nm,em,ph,true) RETURNING id,qr_token INTO created_id,token;
 INSERT INTO public.customer_registration_requests(business_id,request_id,customer_id,client_hash) VALUES(bid,request_key,created_id,client_hash_value);
 RETURN jsonb_build_object('token',token,'created',true);
END; $$;
REVOKE ALL ON FUNCTION public.register_public_customer(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_public_customer(uuid,uuid,text,text,text,text) TO service_role;
COMMIT;
