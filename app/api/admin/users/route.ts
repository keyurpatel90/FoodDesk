import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Role } from '@/lib/types';

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requireAdmin(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const adminClient = serviceClient();
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const { data: profile } = await adminClient.from('profiles').select('id,role,active').eq('id', user.id).single();
  if (!(profile?.active && profile.role === 'admin')) return null;
  const { data: settings } = await adminClient.from('app_settings').select('features').eq('id',1).single();
  if (settings?.features && settings.features.staffManagement === false) return null;
  return user;
}

export async function GET(request: NextRequest) {
  const caller = await requireAdmin(request);
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const adminClient = serviceClient();
  const { data, error } = await adminClient.from('profiles').select('id,email,display_name,role,active,created_at').order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

export async function POST(request: NextRequest) {
  const caller = await requireAdmin(request);
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const adminClient = serviceClient();
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const displayName = String(body.display_name ?? '').trim();
  const role = String(body.role ?? 'cashier') as Role;
  const allowedRoles: Role[] = ['admin', 'manager', 'cashier', 'kitchen', 'treasurer'];
  if (!email || password.length < 6 || !displayName || !allowedRoles.includes(role)) {
    return NextResponse.json({ error: 'Email, name, role and a password of at least 6 characters are required.' }, { status: 400 });
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data.user) return NextResponse.json({ error: error?.message ?? 'Could not create user' }, { status: 400 });

  const { error: profileError } = await adminClient.from('profiles').upsert({
    id: data.user.id,
    email,
    display_name: displayName,
    role,
    active: true,
  });
  if (profileError) {
    await adminClient.auth.admin.deleteUser(data.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }
  return NextResponse.json({ user: { id: data.user.id, email, display_name: displayName, role, active: true } }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const caller = await requireAdmin(request);
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const adminClient = serviceClient();
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? '');
  if (!id || id === caller.id) return NextResponse.json({ error: 'Choose another user to update.' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.role) patch.role = body.role;
  if (typeof body.active === 'boolean') patch.active = body.active;
  if (body.display_name) patch.display_name = String(body.display_name).trim();
  const { data, error } = await adminClient.from('profiles').update(patch).eq('id', id).select('id,email,display_name,role,active,created_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ user: data });
}
