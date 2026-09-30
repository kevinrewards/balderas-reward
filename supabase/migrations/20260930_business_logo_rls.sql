-- The Storage policy must verify the business even before the first Owner is assigned.
-- Checking businesses directly in the policy was filtered by that table's RLS.
BEGIN;
CREATE OR REPLACE FUNCTION public.platform_admin_can_upload_business_logo(object_bucket text, object_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL
 AND COALESCE(public.is_platform_admin(),false)
 AND object_bucket='business-assets'
 AND EXISTS (
  SELECT 1 FROM public.businesses b
  WHERE b.id::text=split_part(object_name,'/',1)
 );
$$;
REVOKE ALL ON FUNCTION public.platform_admin_can_upload_business_logo(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_admin_can_upload_business_logo(text,text) TO authenticated;

DROP POLICY IF EXISTS platform_admin_business_logo_read ON storage.objects;
CREATE POLICY platform_admin_business_logo_read ON storage.objects
 FOR SELECT TO authenticated
 USING (public.platform_admin_can_upload_business_logo(bucket_id,name));
DROP POLICY IF EXISTS platform_admin_business_logo_insert ON storage.objects;
CREATE POLICY platform_admin_business_logo_insert ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK (public.platform_admin_can_upload_business_logo(bucket_id,name));
DROP POLICY IF EXISTS platform_admin_business_logo_update ON storage.objects;
CREATE POLICY platform_admin_business_logo_update ON storage.objects
 FOR UPDATE TO authenticated
 USING (public.platform_admin_can_upload_business_logo(bucket_id,name))
 WITH CHECK (public.platform_admin_can_upload_business_logo(bucket_id,name));
COMMIT;
