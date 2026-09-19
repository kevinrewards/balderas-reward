-- Two write-policy changes were applied manually and confirmed by the user.
-- The SELECT policy below is still pending application before publication.
BEGIN;

ALTER POLICY "Members can create rewards" ON public.rewards
TO authenticated
WITH CHECK (public.can_manage_business_settings(business_id));

ALTER POLICY "Members can update rewards" ON public.rewards
TO authenticated
USING (public.can_manage_business_settings(business_id))
WITH CHECK (public.can_manage_business_settings(business_id));

-- Owners/Staff retain their existing read policies. Superadmin needs SELECT
-- for rewards in businesses where they have no business_members entry.
DROP POLICY IF EXISTS "Platform admins can view all rewards" ON public.rewards;
CREATE POLICY "Platform admins can view all rewards"
ON public.rewards FOR SELECT TO authenticated
USING (public.is_platform_admin());

COMMIT;
