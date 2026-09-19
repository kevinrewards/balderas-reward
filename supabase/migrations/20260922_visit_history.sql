-- Read-only reporting. Does not modify visits or existing registration RPCs.
BEGIN;
CREATE OR REPLACE FUNCTION public.business_visit_history(
  target_business_id uuid, period_start timestamptz, period_end timestamptz,
  page_offset integer DEFAULT 0, report_as_of timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; cutoff timestamptz := least(coalesce(report_as_of, now()), now());
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.can_manage_business_settings(target_business_id),false) THEN
    RAISE EXCEPTION 'Solo Superadmin o un Owner activo de este negocio puede consultar el historial.';
  END IF;
  IF period_start IS NULL OR period_end IS NULL OR period_end <= period_start
    OR NOT isfinite(period_start) OR NOT isfinite(period_end)
    OR page_offset IS NULL OR page_offset < 0 THEN
    RAISE EXCEPTION 'Elige un período válido.';
  END IF;
  WITH filtered AS MATERIALIZED (
    SELECT v.id,v.customer_id,v.created_at,v.registered_by
    FROM public.visits v WHERE v.business_id=target_business_id
      AND v.created_at >= period_start AND v.created_at < period_end AND v.created_at <= cutoff
  ), page AS (
    SELECT f.id,f.customer_id,f.created_at,f.registered_by,
      COALESCE(NULLIF(c.name,''),'Cliente sin nombre') AS customer_name,
      COALESCE(NULLIF(p.full_name,''),CASE WHEN f.registered_by IS NULL
        THEN 'Sin responsable registrado' ELSE 'Usuario sin nombre disponible' END) AS registered_by_name
    FROM (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT 200 OFFSET page_offset) f
    LEFT JOIN public.customers c ON c.id=f.customer_id AND c.business_id=target_business_id
    LEFT JOIN public.profiles p ON p.user_id=f.registered_by
  )
  SELECT jsonb_build_object(
    'total_visits',(SELECT count(*) FROM filtered),
    'unique_customers',(SELECT count(DISTINCT customer_id) FROM filtered),
    'as_of',cutoff,'page_size',200,
    'rows',COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id DESC) FROM page),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.business_visit_history(uuid,timestamptz,timestamptz,integer,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_visit_history(uuid,timestamptz,timestamptz,integer,timestamptz) TO authenticated;
CREATE INDEX IF NOT EXISTS visits_business_history_idx ON public.visits(business_id,created_at DESC,id DESC);
COMMIT;

-- Verify that both registration paths save auth.uid() in registered_by.
-- Returns current definitions for review; does not replace them.
SELECT p.proname AS funcion,pg_get_functiondef(p.oid) AS definicion
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('register_visit','register_visit_by_token');
