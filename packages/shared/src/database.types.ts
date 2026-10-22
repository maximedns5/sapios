
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "access_policy": {
                  Row: {
                    "can_browse": boolean,"copy_key": string,"created_at": string,"daily_like_quota": number | null,"id": string,"min_level": number,"sees_likers": boolean,"tier": Database["public"]['Enums']["access_tier"]
                  }
                  ComputedFields: never
                  Insert: {
                    "can_browse"?: boolean,"copy_key": string,"created_at"?: string,"daily_like_quota"?: number | null,"id"?: string,"min_level": number,"sees_likers"?: boolean,"tier": Database["public"]['Enums']["access_tier"]
                  }
                  Update: {
                    "can_browse"?: boolean,"copy_key"?: string,"created_at"?: string,"daily_like_quota"?: number | null,"id"?: string,"min_level"?: number,"sees_likers"?: boolean,"tier"?: Database["public"]['Enums']["access_tier"]
                  }
                  Relationships: [
                    
                  ]
                },"admins": {
                  Row: {
                    "created_at": string,"role": Database["public"]['Enums']["admin_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["admin_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["admin_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"app_copy": {
                  Row: {
                    "created_at": string,"key": string,"locale": string,"text": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"key": string,"locale"?: string,"text": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"key"?: string,"locale"?: string,"text"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"app_settings": {
                  Row: {
                    "created_at": string,"description": string | null,"key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"entity": string,"entity_id": string | null,"id": string,"payload": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"entity": string,"entity_id"?: string | null,"id"?: string,"payload"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"entity"?: string,"entity_id"?: string | null,"id"?: string,"payload"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"content_flags": {
                  Row: {
                    "created_at": string,"decision_reason": string | null,"excerpt": string,"handled_at": string | null,"handled_by": string | null,"id": string,"item_id": string | null,"kind": Database["public"]['Enums']["content_kind"],"reasons": (string)[],"report_id": string | null,"source": string,"status": Database["public"]['Enums']["content_flag_status"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decision_reason"?: string | null,"excerpt": string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"item_id"?: string | null,"kind": Database["public"]['Enums']["content_kind"],"reasons"?: (string)[],"report_id"?: string | null,"source": string,"status"?: Database["public"]['Enums']["content_flag_status"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"decision_reason"?: string | null,"excerpt"?: string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"item_id"?: string | null,"kind"?: Database["public"]['Enums']["content_kind"],"reasons"?: (string)[],"report_id"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["content_flag_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_flags_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "reports"
      referencedColumns: ["id"]
    }
                  ]
                },"degree_submissions": {
                  Row: {
                    "attempts": number,"confidence": number | null,"created_at": string,"doc_sha256": string | null,"extracted": Json | null,"field_verified": Database["public"]['Enums']["study_field"] | null,"file_deleted_at": string | null,"id": string,"institution_verified": string | null,"level_verified": number | null,"mime": string,"moderator_note": string | null,"rejection_reason": string | null,"reviewed_at": string | null,"reviewer_id": string | null,"signals": (string)[],"status": Database["public"]['Enums']["submission_status"],"storage_path": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"confidence"?: number | null,"created_at"?: string,"doc_sha256"?: string | null,"extracted"?: Json | null,"field_verified"?: Database["public"]['Enums']["study_field"] | null,"file_deleted_at"?: string | null,"id"?: string,"institution_verified"?: string | null,"level_verified"?: number | null,"mime": string,"moderator_note"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewer_id"?: string | null,"signals"?: (string)[],"status"?: Database["public"]['Enums']["submission_status"],"storage_path": string,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"confidence"?: number | null,"created_at"?: string,"doc_sha256"?: string | null,"extracted"?: Json | null,"field_verified"?: Database["public"]['Enums']["study_field"] | null,"file_deleted_at"?: string | null,"id"?: string,"institution_verified"?: string | null,"level_verified"?: number | null,"mime"?: string,"moderator_note"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewer_id"?: string | null,"signals"?: (string)[],"status"?: Database["public"]['Enums']["submission_status"],"storage_path"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"discovery_prefs": {
                  Row: {
                    "created_at": string,"fields": (Database["public"]['Enums']["study_field"])[],"levels": (number)[],"max_distance_km": number | null,"sort": Database["public"]['Enums']["discovery_sort"],"strict_fields": boolean,"strict_levels": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"fields"?: (Database["public"]['Enums']["study_field"])[],"levels"?: (number)[],"max_distance_km"?: number | null,"sort"?: Database["public"]['Enums']["discovery_sort"],"strict_fields"?: boolean,"strict_levels"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"fields"?: (Database["public"]['Enums']["study_field"])[],"levels"?: (number)[],"max_distance_km"?: number | null,"sort"?: Database["public"]['Enums']["discovery_sort"],"strict_fields"?: boolean,"strict_levels"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"matches": {
                  Row: {
                    "created_at": string,"id": string,"unmatched_at": string | null,"user_a": string,"user_b": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"unmatched_at"?: string | null,"user_a": string,"user_b": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"unmatched_at"?: string | null,"user_a"?: string,"user_b"?: string
                  }
                  Relationships: [
                    
                  ]
                },"member_notices": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"payload": NonNullable<Json>,"read_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"messages": {
                  Row: {
                    "body": string,"context": string | null,"created_at": string,"from_like": boolean,"id": string,"liked_item": string | null,"match_id": string,"read_at": string | null,"sender_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"context"?: string | null,"created_at"?: string,"from_like"?: boolean,"id"?: string,"liked_item"?: string | null,"match_id": string,"read_at"?: string | null,"sender_id"?: string
                  }
                  Update: {
                    "body"?: string,"context"?: string | null,"created_at"?: string,"from_like"?: boolean,"id"?: string,"liked_item"?: string | null,"match_id"?: string,"read_at"?: string | null,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_match_id_fkey"
      columns: ["match_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_answers": {
                  Row: {
                    "answer": string,"created_at": string,"id": string,"moderation_status": Database["public"]['Enums']["photo_moderation"],"position": number,"prompt_key": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"created_at"?: string,"id"?: string,"moderation_status"?: Database["public"]['Enums']["photo_moderation"],"position": number,"prompt_key": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "answer"?: string,"created_at"?: string,"id"?: string,"moderation_status"?: Database["public"]['Enums']["photo_moderation"],"position"?: number,"prompt_key"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_answers_prompt_key_fkey"
      columns: ["prompt_key"]
isOneToOne: false
      referencedRelation: "profile_prompts"
      referencedColumns: ["key"]
    }
                  ]
                },"profile_books": {
                  Row: {
                    "author": string | null,"created_at": string,"id": string,"moderation_status": Database["public"]['Enums']["photo_moderation"],"ol_work_id": string | null,"position": number,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author"?: string | null,"created_at"?: string,"id"?: string,"moderation_status"?: Database["public"]['Enums']["photo_moderation"],"ol_work_id"?: string | null,"position": number,"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "author"?: string | null,"created_at"?: string,"id"?: string,"moderation_status"?: Database["public"]['Enums']["photo_moderation"],"ol_work_id"?: string | null,"position"?: number,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profile_photos": {
                  Row: {
                    "created_at": string,"id": string,"moderation_status": Database["public"]['Enums']["photo_moderation"],"position": number,"storage_path": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"moderation_status"?: Database["public"]['Enums']["photo_moderation"],"position"?: number,"storage_path": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"moderation_status"?: Database["public"]['Enums']["photo_moderation"],"position"?: number,"storage_path"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profile_private": {
                  Row: {
                    "birthdate": string | null,"consent_sensitive_at": string | null,"consent_version": string | null,"created_at": string,"legal_name": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "birthdate"?: string | null,"consent_sensitive_at"?: string | null,"consent_version"?: string | null,"created_at"?: string,"legal_name"?: string | null,"user_id": string
                  }
                  Update: {
                    "birthdate"?: string | null,"consent_sensitive_at"?: string | null,"consent_version"?: string | null,"created_at"?: string,"legal_name"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profile_prompts": {
                  Row: {
                    "active": boolean,"created_at": string,"key": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"key": string,"position"?: number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"key"?: string,"position"?: number
                  }
                  Relationships: [
                    
                  ]
                },"profile_theses": {
                  Row: {
                    "created_at": string,"line": string,"moderation_status": Database["public"]['Enums']["photo_moderation"],"updated_at": string,"user_id": string,"visibility": Database["public"]['Enums']["thesis_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"line": string,"moderation_status"?: Database["public"]['Enums']["photo_moderation"],"updated_at"?: string,"user_id"?: string,"visibility"?: Database["public"]['Enums']["thesis_visibility"]
                  }
                  Update: {
                    "created_at"?: string,"line"?: string,"moderation_status"?: Database["public"]['Enums']["photo_moderation"],"updated_at"?: string,"user_id"?: string,"visibility"?: Database["public"]['Enums']["thesis_visibility"]
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "age_max": number,"age_min": number,"bio": string | null,"city": string | null,"created_at": string,"display_name": string | null,"gender": Database["public"]['Enums']["gender"] | null,"id": string,"last_active_at": string,"location": unknown,"seeking_genders": (Database["public"]['Enums']["gender"])[],"show_institution": boolean,"show_quiz_badge": boolean,"status": Database["public"]['Enums']["profile_status"],"study_field": Database["public"]['Enums']["study_field"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "age_max"?: number,"age_min"?: number,"bio"?: string | null,"city"?: string | null,"created_at"?: string,"display_name"?: string | null,"gender"?: Database["public"]['Enums']["gender"] | null,"id": string,"last_active_at"?: string,"location"?: unknown,"seeking_genders"?: (Database["public"]['Enums']["gender"])[],"show_institution"?: boolean,"show_quiz_badge"?: boolean,"status"?: Database["public"]['Enums']["profile_status"],"study_field"?: Database["public"]['Enums']["study_field"] | null
                  }
                  Update: {
                    "age_max"?: number,"age_min"?: number,"bio"?: string | null,"city"?: string | null,"created_at"?: string,"display_name"?: string | null,"gender"?: Database["public"]['Enums']["gender"] | null,"id"?: string,"last_active_at"?: string,"location"?: unknown,"seeking_genders"?: (Database["public"]['Enums']["gender"])[],"show_institution"?: boolean,"show_quiz_badge"?: boolean,"status"?: Database["public"]['Enums']["profile_status"],"study_field"?: Database["public"]['Enums']["study_field"] | null
                  }
                  Relationships: [
                    
                  ]
                },"push_tokens": {
                  Row: {
                    "created_at": string,"platform": Database["public"]['Enums']["push_platform"],"token": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"platform": Database["public"]['Enums']["push_platform"],"token": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"platform"?: Database["public"]['Enums']["push_platform"],"token"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reports": {
                  Row: {
                    "content_item_id": string | null,"content_kind": Database["public"]['Enums']["content_kind"] | null,"created_at": string,"details": string | null,"handled_at": string | null,"handled_by": string | null,"id": string,"reason": string,"reporter_id": string,"status": Database["public"]['Enums']["report_status"],"target_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_item_id"?: string | null,"content_kind"?: Database["public"]['Enums']["content_kind"] | null,"created_at"?: string,"details"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"reason": string,"reporter_id": string,"status"?: Database["public"]['Enums']["report_status"],"target_id": string
                  }
                  Update: {
                    "content_item_id"?: string | null,"content_kind"?: Database["public"]['Enums']["content_kind"] | null,"created_at"?: string,"details"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"reason"?: string,"reporter_id"?: string,"status"?: Database["public"]['Enums']["report_status"],"target_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"swipes": {
                  Row: {
                    "comment": string | null,"created_at": string,"direction": Database["public"]['Enums']["swipe_direction"],"liked_item": string | null,"swiper_id": string,"target_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comment"?: string | null,"created_at"?: string,"direction": Database["public"]['Enums']["swipe_direction"],"liked_item"?: string | null,"swiper_id": string,"target_id": string
                  }
                  Update: {
                    "comment"?: string | null,"created_at"?: string,"direction"?: Database["public"]['Enums']["swipe_direction"],"liked_item"?: string | null,"swiper_id"?: string,"target_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_access": {
                  Row: {
                    "copy_key": string | null,"created_at": string,"granted_at": string,"granted_by": string | null,"institution": string | null,"level": number | null,"source_submission_id": string | null,"study_field": Database["public"]['Enums']["study_field"] | null,"tier": Database["public"]['Enums']["access_tier"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "copy_key"?: string | null,"created_at"?: string,"granted_at"?: string,"granted_by"?: string | null,"institution"?: string | null,"level"?: number | null,"source_submission_id"?: string | null,"study_field"?: Database["public"]['Enums']["study_field"] | null,"tier": Database["public"]['Enums']["access_tier"],"user_id": string
                  }
                  Update: {
                    "copy_key"?: string | null,"created_at"?: string,"granted_at"?: string,"granted_by"?: string | null,"institution"?: string | null,"level"?: number | null,"source_submission_id"?: string | null,"study_field"?: Database["public"]['Enums']["study_field"] | null,"tier"?: Database["public"]['Enums']["access_tier"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_access_source_submission_id_fkey"
      columns: ["source_submission_id"]
isOneToOne: false
      referencedRelation: "degree_submissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_access_source_submission_id_fkey"
      columns: ["source_submission_id"]
isOneToOne: false
      referencedRelation: "my_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"waitlist_signups": {
                  Row: {
                    "city": string | null,"created_at": string,"email": string,"id": string,"level": number | null,"source": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"created_at"?: string,"email": string,"id"?: string,"level"?: number | null,"source"?: string | null
                  }
                  Update: {
                    "city"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"level"?: number | null,"source"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "my_submissions": {
                  Row: {
                    "created_at": string | null,"file_deleted_at": string | null,"id": string | null,"level_verified": number | null,"mime": string | null,"rejection_reason": string | null,"reviewed_at": string | null,"status": Database["public"]['Enums']["submission_status"] | null,"storage_path": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "created_at"?: string | null,"file_deleted_at"?: string | null,"id"?: string | null,"level_verified"?: number | null,"mime"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"status"?: Database["public"]['Enums']["submission_status"] | null,"storage_path"?: string | null
                         }
                        Update: {
                           "created_at"?: string | null,"file_deleted_at"?: string | null,"id"?: string | null,"level_verified"?: number | null,"mime"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"status"?: Database["public"]['Enums']["submission_status"] | null,"storage_path"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "ack_notice":
{ Args: { "p_id": string }; Returns: undefined
                           },
"activate_profile":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"admin_admit_waitlist":
{ Args: { "p_tier"?: Database["public"]['Enums']["access_tier"],"p_user_ids": (string)[] }; Returns: number
                           },
"admin_get_report_context":
{ Args: { "p_report_id": string }; Returns: Json
                           },
"admin_get_submission":
{ Args: { "p_id": string }; Returns: {
              "attempts": number,"birthdate": string,"confidence": number,"created_at": string,"display_name": string,"doc_sha256": string,"email": string,"extracted": Json,"field_verified": Database["public"]['Enums']["study_field"],"file_deleted_at": string,"id": string,"institution_verified": string,"legal_name": string,"level_verified": number,"mime": string,"moderator_note": string,"rejection_reason": string,"reviewed_at": string,"reviewer_id": string,"signals": (string)[],"status": Database["public"]['Enums']["submission_status"],"storage_path": string,"user_id": string
            }[]
                           },
"admin_list_flagged_content":
{ Args: { "p_status"?: Database["public"]['Enums']["content_flag_status"] }; Returns: {
              "created_at": string,"current_text": string,"decision_reason": string,"display_name": string,"email": string,"excerpt": string,"handled_at": string,"handled_by": string,"id": string,"item_id": string,"item_status": Database["public"]['Enums']["photo_moderation"],"kind": Database["public"]['Enums']["content_kind"],"prompt_key": string,"reasons": (string)[],"report_details": string,"report_id": string,"report_reason": string,"source": string,"status": Database["public"]['Enums']["content_flag_status"],"user_id": string
            }[]
                           },
"admin_list_submissions":
{ Args: { "p_status"?: Database["public"]['Enums']["submission_status"] }; Returns: {
              "attempts": number,"birthdate": string,"confidence": number,"created_at": string,"display_name": string,"doc_sha256": string,"email": string,"extracted": Json,"field_verified": Database["public"]['Enums']["study_field"],"file_deleted_at": string,"id": string,"institution_verified": string,"legal_name": string,"level_verified": number,"mime": string,"moderator_note": string,"rejection_reason": string,"reviewed_at": string,"reviewer_id": string,"signals": (string)[],"status": Database["public"]['Enums']["submission_status"],"storage_path": string,"user_id": string
            }[]
                           },
"admin_list_waitlist":
{ Args: Record<PropertyKey, never>; Returns: {
              "copy_key": string,"created_at": string,"display_name": string,"email": string,"granted_at": string,"level": number,"profile_status": Database["public"]['Enums']["profile_status"],"user_id": string
            }[]
                           },
"admin_moderate_content":
{ Args: { "p_decision": string,"p_flag_id": string,"p_reason"?: string }; Returns: undefined
                           },
"admin_set_member_institution":
{ Args: { "p_field": Database["public"]['Enums']["study_field"],"p_institution": string,"p_user": string }; Returns: undefined
                           },
"admin_set_report_status":
{ Args: { "p_ban"?: boolean,"p_report_id": string,"p_status": Database["public"]['Enums']["report_status"] }; Returns: undefined
                           },
"admin_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_update_settings":
{ Args: { "p_values": Json }; Returns: Json
                           },
"apply_diploma_review":
{ Args: { "p_decision": string,"p_field"?: Database["public"]['Enums']["study_field"],"p_institution"?: string,"p_level": number,"p_reason": string,"p_reviewer": string,"p_submission": string }; Returns: Json
                           },
"block_user":
{ Args: { "p_target": string }; Returns: undefined
                           },
"can_view_profile":
{ Args: { "target": string }; Returns: boolean
                           },
"count_discovery":
{ Args: { "p_age_max"?: number,"p_age_min"?: number,"p_fields"?: (Database["public"]['Enums']["study_field"])[],"p_levels"?: (number)[],"p_max_distance_km"?: number,"p_strict_fields"?: boolean,"p_strict_levels"?: boolean }; Returns: Json
                           },
"diploma_queue_delete":
{ Args: { "p_msg_id": number }; Returns: boolean
                           },
"diploma_queue_read":
{ Args: { "p_qty": number,"p_vt": number }; Returns: {
              "enqueued_at": string,"message": Json,"msg_id": number,"read_ct": number,"vt": string
            }[]
                           },
"diplomas_to_purge":
{ Args: { "p_days": number }; Returns: {
              "id": string,"storage_path": string
            }[]
                           },
"export_my_data":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_discovery_prefs":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_feed":
{ Args: { "p_limit"?: number }; Returns: {
              "affinity_reasons": Json,"affinity_score": number,"age": number,"bio": string,"city": string,"display_name": string,"distance_km": number,"field_verified": boolean,"id": string,"institution": string,"level": number,"photo_paths": (string)[],"preview_answer": string,"preview_prompt_key": string,"quiz_badge": boolean,"study_field": Database["public"]['Enums']["study_field"]
            }[]
                           },
"get_likers":
{ Args: Record<PropertyKey, never>; Returns: {
              "age": number,"bio": string,"city": string,"comment": string,"display_name": string,"distance_km": number,"id": string,"level": number,"liked_at": string,"liked_item": string,"liked_photo_path": string,"liked_prompt_key": string,"liked_text": string,"photo_paths": (string)[],"study_field": Database["public"]['Enums']["study_field"]
            }[]
                           },
"get_likes_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"get_matches":
{ Args: Record<PropertyKey, never>; Returns: {
              "display_name": string,"last_message": string,"last_message_at": string,"match_id": string,"other_id": string,"photo_path": string,"unread_count": number
            }[]
                           },
"get_my_state":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_profile":
{ Args: { "p_target": string }; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mark_diploma_purged":
{ Args: { "p_id": string }; Returns: undefined
                           },
"report_user":
{ Args: { "p_content_item"?: string,"p_content_kind"?: Database["public"]['Enums']["content_kind"],"p_details": string,"p_reason": string,"p_target": string }; Returns: string
                           },
"set_discovery_prefs":
{ Args: { "p_age_max"?: number,"p_age_min"?: number,"p_fields"?: (Database["public"]['Enums']["study_field"])[],"p_levels"?: (number)[],"p_max_distance_km"?: number,"p_sort"?: Database["public"]['Enums']["discovery_sort"],"p_strict_fields"?: boolean,"p_strict_levels"?: boolean }; Returns: Json
                           },
"set_identity":
{ Args: { "p_birthdate": string,"p_legal_name": string }; Returns: undefined
                           },
"set_location":
{ Args: { "p_lat": number,"p_lng": number }; Returns: undefined
                           },
"set_paused":
{ Args: { "p_paused": boolean }; Returns: undefined
                           },
"set_sensitive_consent":
{ Args: { "p_granted": boolean,"p_version": string }; Returns: undefined
                           },
"swipe":
{ Args: { "p_comment"?: string,"p_direction": Database["public"]['Enums']["swipe_direction"],"p_liked_item"?: string,"p_target": string }; Returns: Json
                           },
"unmatch":
{ Args: { "p_match_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "access_tier": "unlimited"|"standard"|"waitlist"|"refused","admin_role": "moderator"|"owner","content_flag_status": "open"|"kept"|"removed"|"withdrawn","content_kind": "answer"|"book"|"thesis","discovery_sort": "activity"|"affinity","gender": "woman"|"man"|"nonbinary","photo_moderation": "pending"|"approved"|"rejected","profile_status": "onboarding"|"active"|"paused"|"banned","push_platform": "ios"|"android"|"web","report_status": "open"|"actioned"|"dismissed","study_field": "education"|"arts"|"letters"|"philosophy"|"history"|"social_sciences"|"economics"|"law"|"sciences"|"mathematics"|"computing"|"engineering"|"agronomy"|"health","submission_status": "pending"|"processing"|"needs_review"|"approved"|"rejected"|"needs_more","swipe_direction": "like"|"pass","thesis_visibility": "everyone"|"matches"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "access_tier": ["unlimited", "standard", "waitlist", "refused"],"admin_role": ["moderator", "owner"],"content_flag_status": ["open", "kept", "removed", "withdrawn"],"content_kind": ["answer", "book", "thesis"],"discovery_sort": ["activity", "affinity"],"gender": ["woman", "man", "nonbinary"],"photo_moderation": ["pending", "approved", "rejected"],"profile_status": ["onboarding", "active", "paused", "banned"],"push_platform": ["ios", "android", "web"],"report_status": ["open", "actioned", "dismissed"],"study_field": ["education", "arts", "letters", "philosophy", "history", "social_sciences", "economics", "law", "sciences", "mathematics", "computing", "engineering", "agronomy", "health"],"submission_status": ["pending", "processing", "needs_review", "approved", "rejected", "needs_more"],"swipe_direction": ["like", "pass"],"thesis_visibility": ["everyone", "matches"]
          }
        }
} as const
