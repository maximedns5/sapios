-- Types énumérés partagés (contrat §1).

create type public.profile_status as enum ('onboarding', 'active', 'paused', 'banned');
create type public.access_tier as enum ('unlimited', 'standard', 'waitlist', 'refused');
create type public.submission_status as enum ('pending', 'processing', 'needs_review', 'approved', 'rejected', 'needs_more');
create type public.swipe_direction as enum ('like', 'pass');
create type public.gender as enum ('woman', 'man', 'nonbinary');
create type public.photo_moderation as enum ('pending', 'approved', 'rejected');
create type public.report_status as enum ('open', 'actioned', 'dismissed');
create type public.admin_role as enum ('moderator', 'owner');
create type public.push_platform as enum ('ios', 'android', 'web');
