-- Insert test client
INSERT INTO clients (id, name, slug, created_at)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Test Client',
  'test-client',
  now()
) ON CONFLICT (slug) DO NOTHING;

-- Insert test user profile
INSERT INTO profiles (id, email, full_name, created_at)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'test@test.com'),
  'test@test.com',
  'Test User',
  now()
) ON CONFLICT (id) DO NOTHING;

-- Link user to client
INSERT INTO user_clients (user_id, client_id)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'test@test.com'),
  'a0000000-0000-0000-0000-000000000001'
) ON CONFLICT DO NOTHING;

-- Give user a role
INSERT INTO user_roles (user_id, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'test@test.com'),
  'admin'
) ON CONFLICT DO NOTHING;