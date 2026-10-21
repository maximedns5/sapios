
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
                },"degree_submissions": {
                  Row: {
                    "attempts": number,"confidence": number | null,"created_at": string,"doc_sha256": string | null,"extracted": Json | null,"file_deleted_at": string | null,"id": string,"level_verified": number | null,"mime": string,"moderator_note": string | null,"rejection_reason": string | null,"reviewed_at": string | null,"reviewer_id": string | null,"signals": (string)[],"status": Database["public"]['Enums']["submission_status"],"storage_path": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"confidence"?: number | null,"created_at"?: string,"doc_sha256"?: string | null,"extracted"?: Json | null,"file_deleted_at"?: string | null,"id"?: string,"level_verified"?: number | null,"mime": string,"moderator_note"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewer_id"?: string | null,"signals"?: (string)[],"status"?: Database["public"]['Enums']["submission_status"],"storage_path": string,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"confidence"?: number | null,"created_at"?: string,"doc_sha256"?: string | null,"extracted"?: Json | null,"file_deleted_at"?: string | null,"id"?: string,"level_verified"?: number | null,"mime"?: string,"moderator_note"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewer_id"?: string | null,"signals"?: (string)[],"status"?: Database["public"]['Enums']["submission_status"],"storage_path"?: string,"user_id"?: string
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
                },"messages": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"match_id": string,"read_at": string | null,"sender_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"match_id": string,"read_at"?: string | null,"sender_id"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"match_id"?: string,"read_at"?: string | null,"sender_id"?: string
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
                },"profiles": {
                  Row: {
                    "age_max": number,"age_min": number,"bio": string | null,"city": string | null,"created_at": string,"display_name": string | null,"gender": Database["public"]['Enums']["gender"] | null,"id": string,"last_active_at": string,"location": unknown,"seeking_genders": (Database["public"]['Enums']["gender"])[],"status": Database["public"]['Enums']["profile_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "age_max"?: number,"age_min"?: number,"bio"?: string | null,"city"?: string | null,"created_at"?: string,"display_name"?: string | null,"gender"?: Database["public"]['Enums']["gender"] | null,"id": string,"last_active_at"?: string,"location"?: unknown,"seeking_genders"?: (Database["public"]['Enums']["gender"])[],"status"?: Database["public"]['Enums']["profile_status"]
                  }
                  Update: {
                    "age_max"?: number,"age_min"?: number,"bio"?: string | null,"city"?: string | null,"created_at"?: string,"display_name"?: string | null,"gender"?: Database["public"]['Enums']["gender"] | null,"id"?: string,"last_active_at"?: string,"location"?: unknown,"seeking_genders"?: (Database["public"]['Enums']["gender"])[],"status"?: Database["public"]['Enums']["profile_status"]
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
                    "created_at": string,"details": string | null,"handled_at": string | null,"handled_by": string | null,"id": string,"reason": string,"reporter_id": string,"status": Database["public"]['Enums']["report_status"],"target_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"reason": string,"reporter_id": string,"status"?: Database["public"]['Enums']["report_status"],"target_id": string
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"reason"?: string,"reporter_id"?: string,"status"?: Database["public"]['Enums']["report_status"],"target_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"swipes": {
                  Row: {
                    "created_at": string,"direction": Database["public"]['Enums']["swipe_direction"],"swiper_id": string,"target_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"direction": Database["public"]['Enums']["swipe_direction"],"swiper_id": string,"target_id": string
                  }
                  Update: {
                    "created_at"?: string,"direction"?: Database["public"]['Enums']["swipe_direction"],"swiper_id"?: string,"target_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_access": {
                  Row: {
                    "copy_key": string | null,"created_at": string,"granted_at": string,"granted_by": string | null,"level": number | null,"source_submission_id": string | null,"tier": Database["public"]['Enums']["access_tier"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "copy_key"?: string | null,"created_at"?: string,"granted_at"?: string,"granted_by"?: string | null,"level"?: number | null,"source_submission_id"?: string | null,"tier": Database["public"]['Enums']["access_tier"],"user_id": string
                  }
                  Update: {
                    "copy_key"?: string | null,"created_at"?: string,"granted_at"?: string,"granted_by"?: string | null,"level"?: number | null,"source_submission_id"?: string | null,"tier"?: Database["public"]['Enums']["access_tier"],"user_id"?: string
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
                    "created_at": string,"email": string,"id": string,"source": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"id"?: string,"source"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"id"?: string,"source"?: string | null
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
            "activate_profile":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"admin_admit_waitlist":
{ Args: { "p_tier"?: Database["public"]['Enums']["access_tier"],"p_user_ids": (string)[] }; Returns: number
                           },
"admin_get_submission":
{ Args: { "p_id": string }; Returns: {
              "attempts": number,"birthdate": string,"confidence": number,"created_at": string,"display_name": string,"doc_sha256": string,"email": string,"extracted": Json,"file_deleted_at": string,"id": string,"legal_name": string,"level_verified": number,"mime": string,"moderator_note": string,"rejection_reason": string,"reviewed_at": string,"reviewer_id": string,"signals": (string)[],"status": Database["public"]['Enums']["submission_status"],"storage_path": string,"user_id": string
            }[]
                           },
"admin_list_submissions":
{ Args: { "p_status"?: Database["public"]['Enums']["submission_status"] }; Returns: {
              "attempts": number,"birthdate": string,"confidence": number,"created_at": string,"display_name": string,"doc_sha256": string,"email": string,"extracted": Json,"file_deleted_at": string,"id": string,"legal_name": string,"level_verified": number,"mime": string,"moderator_note": string,"rejection_reason": string,"reviewed_at": string,"reviewer_id": string,"signals": (string)[],"status": Database["public"]['Enums']["submission_status"],"storage_path": string,"user_id": string
            }[]
                           },
"admin_list_waitlist":
{ Args: Record<PropertyKey, never>; Returns: {
              "copy_key": string,"created_at": string,"display_name": string,"email": string,"granted_at": string,"level": number,"profile_status": Database["public"]['Enums']["profile_status"],"user_id": string
            }[]
                           },
"admin_set_report_status":
{ Args: { "p_ban"?: boolean,"p_report_id": string,"p_status": Database["public"]['Enums']["report_status"] }; Returns: undefined
                           },
"admin_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"apply_diploma_review":
{ Args: { "p_decision": string,"p_level": number,"p_reason": string,"p_reviewer": string,"p_submission": string }; Returns: Json
                           },
"block_user":
{ Args: { "p_target": string }; Returns: undefined
                           },
"can_view_profile":
{ Args: { "target": string }; Returns: boolean
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
"get_feed":
{ Args: { "p_limit"?: number }; Returns: {
              "age": number,"bio": string,"city": string,"display_name": string,"distance_km": number,"id": string,"photo_paths": (string)[]
            }[]
                           },
"get_likers":
{ Args: Record<PropertyKey, never>; Returns: {
              "age": number,"bio": string,"city": string,"display_name": string,"distance_km": number,"id": string,"photo_paths": (string)[]
            }[]
                           },
"get_matches":
{ Args: Record<PropertyKey, never>; Returns: {
              "display_name": string,"last_message": string,"last_message_at": string,"match_id": string,"other_id": string,"photo_path": string,"unread_count": number
            }[]
                           },
"get_my_state":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mark_diploma_purged":
{ Args: { "p_id": string }; Returns: undefined
                           },
"report_user":
{ Args: { "p_details": string,"p_reason": string,"p_target": string }; Returns: string
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
{ Args: { "p_direction": Database["public"]['Enums']["swipe_direction"],"p_target": string }; Returns: Json
                           },
"unmatch":
{ Args: { "p_match_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "access_tier": "unlimited"|"standard"|"waitlist"|"refused","admin_role": "moderator"|"owner","gender": "woman"|"man"|"nonbinary","photo_moderation": "pending"|"approved"|"rejected","profile_status": "onboarding"|"active"|"paused"|"banned","push_platform": "ios"|"android"|"web","report_status": "open"|"actioned"|"dismissed","submission_status": "pending"|"processing"|"needs_review"|"approved"|"rejected"|"needs_more","swipe_direction": "like"|"pass"
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
            "access_tier": ["unlimited", "standard", "waitlist", "refused"],"admin_role": ["moderator", "owner"],"gender": ["woman", "man", "nonbinary"],"photo_moderation": ["pending", "approved", "rejected"],"profile_status": ["onboarding", "active", "paused", "banned"],"push_platform": ["ios", "android", "web"],"report_status": ["open", "actioned", "dismissed"],"submission_status": ["pending", "processing", "needs_review", "approved", "rejected", "needs_more"],"swipe_direction": ["like", "pass"]
          }
        }
} as const
