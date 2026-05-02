-- 1. Create Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    full_name TEXT,
    email TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'user',  -- 'user' = طالب, 'admin' = مشرف
    user_type TEXT,                     -- 'school_student' or 'post_study'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Conversations Table
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    title TEXT DEFAULT 'محادثة جديدة',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
    role TEXT CHECK (role IN ('user', 'assistant')) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create Recommendations Table
CREATE TABLE IF NOT EXISTS public.recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    primary_major TEXT,
    compatibility_score INTEGER,
    explanation TEXT,
    roadmap JSONB,
    student_status_tags JSONB,
    admin_executive_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS Policies

-- Profiles: Users can only see and edit their own profile
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Create a secure function to check admin status and avoid infinite recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Admin: An admin can read ALL profiles (needed for admin dashboard)
CREATE POLICY "Admin can view all profiles" ON public.profiles
    FOR SELECT USING ( public.is_admin() );

-- Users can view profiles of people they share a thread with
CREATE POLICY "Users can view common thread profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.dm_threads t
            WHERE (t.admin_id = auth.uid() OR t.student_id = auth.uid()) 
            AND (t.admin_id = public.profiles.id OR t.student_id = public.profiles.id)
        ) OR
        EXISTS (
            SELECT 1 FROM public.dm_thread_participants p1
            JOIN public.dm_thread_participants p2 ON p1.thread_id = p2.thread_id
            WHERE p1.user_id = auth.uid() AND p2.user_id = public.profiles.id
        )
    );

-- Conversations: Users can manage their own conversations
CREATE POLICY "Users can manage own conversations" ON public.conversations 
    FOR ALL USING (auth.uid() = user_id);

-- Conversations: Admins can view all conversations
CREATE POLICY "Admin can view all conversations" ON public.conversations
    FOR SELECT USING ( public.is_admin() );

-- Messages: Users can manage messages in their conversations
DROP POLICY IF EXISTS "Users can manage messages" ON public.messages;
CREATE POLICY "Users can manage messages" ON public.messages 
    FOR ALL USING (
        conversation_id IN (
            SELECT id FROM public.conversations WHERE user_id = auth.uid()
        )
    );

-- Recommendations: Users can see their own recommendations
CREATE POLICY "Users can view own recommendations" ON public.recommendations 
    FOR ALL USING (auth.uid() = user_id);

-- Admin: An admin can read ALL recommendations
CREATE POLICY "Admin can view all recommendations" ON public.recommendations
    FOR SELECT USING ( public.is_admin() );

-- 7. Trigger to sync auth metadata to profiles (Optional but recommended)
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, avatar_url, user_type)
    VALUES (
        NEW.id, 
        NEW.raw_user_meta_data->>'full_name', 
        NEW.email, 
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.raw_user_meta_data->>'user_type'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ترقية حساب إلى مشرف (شغّل هذا يدوياً في Supabase SQL Editor)
-- استبدل YOUR_EMAIL@DOMAIN.COM ببريد حساب المشرف:
-- ============================================================
-- UPDATE public.profiles
-- SET role = 'admin'
-- WHERE email = 'YOUR_EMAIL@DOMAIN.COM';
-- ============================================================

-- التحقّق من وجود عمود role:
-- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- 8. Create Library Table (for saved images)
CREATE TABLE IF NOT EXISTS public.library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    image_url TEXT NOT NULL,
    title TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own library" ON public.library 
    FOR ALL USING (auth.uid() = user_id);

-- 9. Create DM Threads Table
CREATE TABLE IF NOT EXISTS public.dm_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES public.profiles(id),
    student_id UUID REFERENCES public.profiles(id),
    is_group BOOLEAN DEFAULT false,
    group_name TEXT,
    group_avatar_url TEXT,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Create DM Participants Table (for groups)
CREATE TABLE IF NOT EXISTS public.dm_thread_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES public.dm_threads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Create DM Messages Table
CREATE TABLE IF NOT EXISTS public.dm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES public.dm_threads(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    is_edited BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for DM tables
ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

-- Simple DM Policies (Admins and Students can view threads they belong to)
-- Tight DM Policies: Users can only see threads where they are the specific admin or student, or explicit participant.
DROP POLICY IF EXISTS "Users can view their threads" ON public.dm_threads;
DROP POLICY IF EXISTS "Users can view their participants" ON public.dm_thread_participants;
DROP POLICY IF EXISTS "Users can select participants" ON public.dm_thread_participants;
DROP POLICY IF EXISTS "Users can insert participants" ON public.dm_thread_participants;
DROP POLICY IF EXISTS "Users can delete participants" ON public.dm_thread_participants;

-- Security Definer function to prevent RLS infinite recursion
CREATE OR REPLACE FUNCTION public.is_thread_participant(t_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.dm_thread_participants
        WHERE thread_id = t_id AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Users can view their threads" ON public.dm_threads
    FOR ALL USING (
        auth.uid() = admin_id OR 
        auth.uid() = student_id OR
        public.is_thread_participant(id)
    );

CREATE POLICY "Users can select participants" ON public.dm_thread_participants
    FOR SELECT USING (
        user_id = auth.uid() OR
        public.is_thread_participant(thread_id)
    );

CREATE POLICY "Users can insert participants" ON public.dm_thread_participants
    FOR INSERT WITH CHECK (
        user_id = auth.uid() OR
        (SELECT admin_id FROM public.dm_threads WHERE id = thread_id) = auth.uid()
    );

CREATE POLICY "Users can delete participants" ON public.dm_thread_participants
    FOR DELETE USING (
        user_id = auth.uid() OR
        (SELECT admin_id FROM public.dm_threads WHERE id = thread_id) = auth.uid()
    );

DROP POLICY IF EXISTS "Users can manage their messages" ON public.dm_messages;
CREATE POLICY "Users can manage their messages" ON public.dm_messages
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.dm_threads dt WHERE dt.id = thread_id AND (dt.admin_id = auth.uid() OR dt.student_id = auth.uid())) OR
        EXISTS (SELECT 1 FROM public.dm_thread_participants pt WHERE pt.thread_id = thread_id AND pt.user_id = auth.uid())
    );

-- 12. Enable Realtime for DM tables
-- These commands enable the Supabase Realtime broadcast for the DM tables.
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_thread_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recommendations;

-- 13. Optimize for Realtime (Ensuring direct column RLS checks)
-- Supabase Realtime does not support RLS policies with subqueries/EXISTS.
-- We add admin_id and student_id directly to messages for direct column RLS.

ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES public.profiles(id);

-- Trigger to auto-populate columns from dm_threads
CREATE OR REPLACE FUNCTION public.populate_message_participants()
RETURNS TRIGGER AS $$
BEGIN
    SELECT admin_id, student_id INTO NEW.admin_id, NEW.student_id
    FROM public.dm_threads
    WHERE id = NEW.thread_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_populate_message_participants ON public.dm_messages;
CREATE TRIGGER tr_populate_message_participants
BEFORE INSERT ON public.dm_messages
FOR EACH ROW EXECUTE FUNCTION public.populate_message_participants();

-- Update RLS Policy to use direct column checks only
DROP POLICY IF EXISTS "Users can manage their messages" ON public.dm_messages;
CREATE POLICY "Users can manage their messages" ON public.dm_messages
    FOR ALL USING (
        auth.uid() = admin_id OR 
        auth.uid() = student_id OR
        auth.uid() = sender_id
    );

-- Backfill existing messages
UPDATE public.dm_messages m
SET admin_id = t.admin_id,
    student_id = t.student_id
FROM public.dm_threads t
WHERE m.thread_id = t.id AND m.admin_id IS NULL;

-- Set Replica Identity to FULL
ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;
ALTER TABLE public.dm_threads REPLICA IDENTITY FULL;
ALTER TABLE public.dm_thread_participants REPLICA IDENTITY FULL;

-- ============================================================
-- 14. Create Storage Bucket for Chat Attachments
-- ============================================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow authenticated users to upload files
CREATE POLICY "Users can upload chat attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'chat-attachments'
);

-- Policy to allow anyone to read files from public bucket
CREATE POLICY "Anyone can view chat attachments"
ON storage.objects FOR SELECT
TO public
USING (
    bucket_id = 'chat-attachments'
);

-- ============================================================
-- 15. Create Schools Table & Bind Profiles
-- ============================================================

-- Create the schools table
CREATE TABLE IF NOT EXISTS public.schools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    admin_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for schools
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- Setup basic policies
CREATE POLICY "Anyone can view schools" ON public.schools FOR SELECT USING (true);
CREATE POLICY "Admins can manage their schools" ON public.schools FOR ALL USING (auth.uid() = admin_id);

-- Add school_id to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_id TEXT REFERENCES public.schools(id);

