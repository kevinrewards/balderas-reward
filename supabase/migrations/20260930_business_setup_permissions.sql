-- Allow Superadmin to configure branding and upload a logo before assigning the first Owner.
-- Existing Owner/Staff policies remain in place.
BEGIN;
ALTER TABLE public.business_branding ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.business_branding TO authenticated;
DROP POLICY IF EXISTS platform_admin_branding_read ON public.business_branding;
CREATE POLICY platform_admin_branding_read ON public.business_branding FOR SELECT TO authenticated
 USING (COALESCE(public.is_platform_admin(),false));
DROP POLICY IF EXISTS platform_admin_branding_insert ON public.business_branding;
CREATE POLICY platform_admin_branding_insert ON public.business_branding FOR INSERT TO authenticated
 WITH CHECK (COALESCE(public.is_platform_admin(),false));
DROP POLICY IF EXISTS platform_admin_branding_update ON public.business_branding;
CREATE POLICY platform_admin_branding_update ON public.business_branding FOR UPDATE TO authenticated
 USING (COALESCE(public.is_platform_admin(),false))
 WITH CHECK (COALESCE(public.is_platform_admin(),false));

DROP POLICY IF EXISTS platform_admin_business_logo_read ON storage.objects;
CREATE POLICY platform_admin_business_logo_read ON storage.objects
 FOR SELECT TO authenticated USING (
 bucket_id='business-assets' AND COALESCE(public.is_platform_admin(),false)
 AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text=split_part(name,'/',1))
 );
DROP POLICY IF EXISTS platform_admin_business_logo_insert ON storage.objects;
CREATE POLICY platform_admin_business_logo_insert ON storage.objects
 FOR INSERT TO authenticated WITH CHECK (
 bucket_id='business-assets' AND COALESCE(public.is_platform_admin(),false)
 AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text=split_part(name,'/',1))
 );
DROP POLICY IF EXISTS platform_admin_business_logo_update ON storage.objects;
CREATE POLICY platform_admin_business_logo_update ON storage.objects
 FOR UPDATE TO authenticated USING (
 bucket_id='business-assets' AND COALESCE(public.is_platform_admin(),false)
 AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text=split_part(name,'/',1))
 ) WITH CHECK (
 bucket_id='business-assets' AND COALESCE(public.is_platform_admin(),false)
 AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text=split_part(name,'/',1))
 );
COMMIT;
