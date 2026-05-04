-- Allow approved users to remove saved AI reports from the Dashboard list

CREATE POLICY "Approved users can delete dashboard_ai_reports for accessible clients"
  ON public.dashboard_ai_reports
  FOR DELETE
  TO authenticated
  USING (
    public.user_can_access_client(client_id)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );
