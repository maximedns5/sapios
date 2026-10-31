
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
                },"application_messages": {
                  Row: {
                    "application_id": string,"body": string,"context": string | null,"created_at": string,"from_candidate": boolean,"id": string,"read_at": string | null,"sender_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"body": string,"context"?: string | null,"created_at"?: string,"from_candidate": boolean,"id"?: string,"read_at"?: string | null,"sender_id"?: string | null
                  }
                  Update: {
                    "application_id"?: string,"body"?: string,"context"?: string | null,"created_at"?: string,"from_candidate"?: boolean,"id"?: string,"read_at"?: string | null,"sender_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_messages_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    }
                  ]
                },"application_notes": {
                  Row: {
                    "application_id": string,"author_id": string | null,"body": string,"created_at": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"author_id"?: string | null,"body": string,"created_at"?: string,"id"?: string
                  }
                  Update: {
                    "application_id"?: string,"author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_notes_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    }
                  ]
                },"applications": {
                  Row: {
                    "candidate_id": string,"closed_at": string | null,"company_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"due_at": string,"id": string,"interested_at": string | null,"invited": boolean,"note": string | null,"note_target": string | null,"note_target_label": string | null,"offer_id": string,"refusal_message": string | null,"refusal_reason": Database["public"]['Enums']["refusal_reason"] | null,"seen_at": string | null,"status": Database["public"]['Enums']["application_status"],"updated_at": string,"withdrawn_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"closed_at"?: string | null,"company_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"due_at": string,"id"?: string,"interested_at"?: string | null,"invited"?: boolean,"note"?: string | null,"note_target"?: string | null,"note_target_label"?: string | null,"offer_id": string,"refusal_message"?: string | null,"refusal_reason"?: Database["public"]['Enums']["refusal_reason"] | null,"seen_at"?: string | null,"status"?: Database["public"]['Enums']["application_status"],"updated_at"?: string,"withdrawn_at"?: string | null
                  }
                  Update: {
                    "candidate_id"?: string,"closed_at"?: string | null,"company_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"due_at"?: string,"id"?: string,"interested_at"?: string | null,"invited"?: boolean,"note"?: string | null,"note_target"?: string | null,"note_target_label"?: string | null,"offer_id"?: string,"refusal_message"?: string | null,"refusal_reason"?: Database["public"]['Enums']["refusal_reason"] | null,"seen_at"?: string | null,"status"?: Database["public"]['Enums']["application_status"],"updated_at"?: string,"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    }
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
                },"candidate_identities": {
                  Row: {
                    "first_name": string,"last_name_enc": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "first_name": string,"last_name_enc": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "first_name"?: string,"last_name_enc"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"candidates": {
                  Row: {
                    "available_from": string | null,"contract_types": (Database["public"]['Enums']["contract_type"])[],"created_at": string,"experience_band": Database["public"]['Enums']["experience_band"],"last_active_at": string,"looking_for": string | null,"number": number,"open_since": string | null,"open_to_opportunities": boolean,"paused": boolean,"remote_days_min": number,"salary_max_k": number,"salary_min_k": number,"search_city": string,"search_location": unknown,"search_postcode": string | null,"search_radius_km": number,"show_institution": boolean,"target_role": string,"updated_at": string,"user_id": string,"work_authorization": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "available_from"?: string | null,"contract_types": (Database["public"]['Enums']["contract_type"])[],"created_at"?: string,"experience_band": Database["public"]['Enums']["experience_band"],"last_active_at"?: string,"looking_for"?: string | null,"number"?: number,"open_since"?: string | null,"open_to_opportunities"?: boolean,"paused"?: boolean,"remote_days_min"?: number,"salary_max_k": number,"salary_min_k": number,"search_city": string,"search_location": unknown,"search_postcode"?: string | null,"search_radius_km"?: number,"show_institution"?: boolean,"target_role": string,"updated_at"?: string,"user_id": string,"work_authorization"?: boolean
                  }
                  Update: {
                    "available_from"?: string | null,"contract_types"?: (Database["public"]['Enums']["contract_type"])[],"created_at"?: string,"experience_band"?: Database["public"]['Enums']["experience_band"],"last_active_at"?: string,"looking_for"?: string | null,"number"?: number,"open_since"?: string | null,"open_to_opportunities"?: boolean,"paused"?: boolean,"remote_days_min"?: number,"salary_max_k"?: number,"salary_min_k"?: number,"search_city"?: string,"search_location"?: unknown,"search_postcode"?: string | null,"search_radius_km"?: number,"show_institution"?: boolean,"target_role"?: string,"updated_at"?: string,"user_id"?: string,"work_authorization"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"companies": {
                  Row: {
                    "city": string | null,"created_at": string,"created_by": string | null,"description": string | null,"display_name": string,"email_domain": string | null,"email_domain_generic": boolean,"headcount_band": string | null,"id": string,"legal_name": string,"naf_code": string | null,"naf_label": string | null,"postcode": string | null,"siren": string,"sirene": Json | null,"status": Database["public"]['Enums']["company_status"],"status_reason": string | null,"updated_at": string,"verified_at": string | null,"verified_by": string | null,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"display_name": string,"email_domain"?: string | null,"email_domain_generic"?: boolean,"headcount_band"?: string | null,"id"?: string,"legal_name": string,"naf_code"?: string | null,"naf_label"?: string | null,"postcode"?: string | null,"siren": string,"sirene"?: Json | null,"status"?: Database["public"]['Enums']["company_status"],"status_reason"?: string | null,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null,"website"?: string | null
                  }
                  Update: {
                    "city"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"display_name"?: string,"email_domain"?: string | null,"email_domain_generic"?: boolean,"headcount_band"?: string | null,"id"?: string,"legal_name"?: string,"naf_code"?: string | null,"naf_label"?: string | null,"postcode"?: string | null,"siren"?: string,"sirene"?: Json | null,"status"?: Database["public"]['Enums']["company_status"],"status_reason"?: string | null,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null,"website"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"company_blocks": {
                  Row: {
                    "candidate_id": string,"company_id": string,"created_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"company_id": string,"created_at"?: string
                  }
                  Update: {
                    "candidate_id"?: string,"company_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_blocks_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"company_members": {
                  Row: {
                    "company_id": string,"created_at": string,"first_name": string | null,"job_title": string,"role": Database["public"]['Enums']["company_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"first_name"?: string | null,"job_title": string,"role"?: Database["public"]['Enums']["company_role"],"user_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"first_name"?: string | null,"job_title"?: string,"role"?: Database["public"]['Enums']["company_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_members_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"cv_experiences": {
                  Row: {
                    "employer": string,"employer_hidden": boolean,"end_month": string | null,"id": string,"position": number,"start_month": string,"summary": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "employer": string,"employer_hidden"?: boolean,"end_month"?: string | null,"id"?: string,"position": number,"start_month": string,"summary"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "employer"?: string,"employer_hidden"?: boolean,"end_month"?: string | null,"id"?: string,"position"?: number,"start_month"?: string,"summary"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cv_languages": {
                  Row: {
                    "language": string,"level": Database["public"]['Enums']["language_level"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "language": string,"level": Database["public"]['Enums']["language_level"],"user_id": string
                  }
                  Update: {
                    "language"?: string,"level"?: Database["public"]['Enums']["language_level"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cv_skills": {
                  Row: {
                    "label": string,"position": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "label": string,"position": number,"user_id": string
                  }
                  Update: {
                    "label"?: string,"position"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
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
                },"emploi_accounts": {
                  Row: {
                    "created_at": string,"kind": Database["public"]['Enums']["emploi_account_kind"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"kind": Database["public"]['Enums']["emploi_account_kind"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"kind"?: Database["public"]['Enums']["emploi_account_kind"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"interview_slots": {
                  Row: {
                    "application_id": string,"created_at": string,"created_by": string | null,"duration_min": number,"id": string,"location": string | null,"mode": Database["public"]['Enums']["interview_mode"],"responded_at": string | null,"starts_at": string,"status": Database["public"]['Enums']["slot_status"],"with_whom": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"created_by"?: string | null,"duration_min"?: number,"id"?: string,"location"?: string | null,"mode"?: Database["public"]['Enums']["interview_mode"],"responded_at"?: string | null,"starts_at": string,"status"?: Database["public"]['Enums']["slot_status"],"with_whom"?: string | null
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"created_by"?: string | null,"duration_min"?: number,"id"?: string,"location"?: string | null,"mode"?: Database["public"]['Enums']["interview_mode"],"responded_at"?: string | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["slot_status"],"with_whom"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "interview_slots_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "candidate_id": string,"company_id": string,"created_at": string,"created_by": string | null,"id": string,"message": string,"offer_id": string,"responded_at": string | null,"status": Database["public"]['Enums']["invitation_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"message": string,"offer_id": string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["invitation_status"]
                  }
                  Update: {
                    "candidate_id"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"message"?: string,"offer_id"?: string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["invitation_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    }
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
                },"offer_passes": {
                  Row: {
                    "created_at": string,"offer_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"offer_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"offer_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "offer_passes_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    }
                  ]
                },"offer_photos": {
                  Row: {
                    "company_id": string,"consent_certified": boolean,"created_at": string,"id": string,"kind": Database["public"]['Enums']["offer_photo_kind"],"moderation": Database["public"]['Enums']["photo_moderation"],"moderation_reason": string | null,"offer_id": string,"position": number,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"consent_certified"?: boolean,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["offer_photo_kind"],"moderation"?: Database["public"]['Enums']["photo_moderation"],"moderation_reason"?: string | null,"offer_id": string,"position"?: number,"storage_path": string
                  }
                  Update: {
                    "company_id"?: string,"consent_certified"?: boolean,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["offer_photo_kind"],"moderation"?: Database["public"]['Enums']["photo_moderation"],"moderation_reason"?: string | null,"offer_id"?: string,"position"?: number,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "offer_photos_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offer_photos_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    }
                  ]
                },"offer_reports": {
                  Row: {
                    "created_at": string,"details": string | null,"handled_at": string | null,"handled_by": string | null,"id": string,"offer_id": string,"reason": Database["public"]['Enums']["offer_report_reason"],"reporter_id": string | null,"status": Database["public"]['Enums']["report_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"offer_id": string,"reason": Database["public"]['Enums']["offer_report_reason"],"reporter_id"?: string | null,"status"?: Database["public"]['Enums']["report_status"]
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"offer_id"?: string,"reason"?: Database["public"]['Enums']["offer_report_reason"],"reporter_id"?: string | null,"status"?: Database["public"]['Enums']["report_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "offer_reports_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    }
                  ]
                },"offers": {
                  Row: {
                    "address_label": string | null,"city": string | null,"closed_at": string | null,"company_id": string,"contract": Database["public"]['Enums']["contract_type"],"created_at": string,"created_by": string | null,"experience_band": Database["public"]['Enums']["experience_band"],"expires_at": string | null,"id": string,"interviews_count": number,"language_justification": string | null,"location": unknown,"manager_name": string | null,"manager_title": string | null,"missions": (string)[],"must_have": (string)[],"nice_to_have": (string)[],"postcode": string | null,"published_at": string | null,"remote_days": number,"response_days": number,"salary_max_k": number | null,"salary_min_k": number | null,"start_label": string | null,"status": Database["public"]['Enums']["offer_status"],"status_reason": string | null,"submitted_at": string | null,"team_description": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address_label"?: string | null,"city"?: string | null,"closed_at"?: string | null,"company_id": string,"contract"?: Database["public"]['Enums']["contract_type"],"created_at"?: string,"created_by"?: string | null,"experience_band"?: Database["public"]['Enums']["experience_band"],"expires_at"?: string | null,"id"?: string,"interviews_count"?: number,"language_justification"?: string | null,"location"?: unknown,"manager_name"?: string | null,"manager_title"?: string | null,"missions"?: (string)[],"must_have"?: (string)[],"nice_to_have"?: (string)[],"postcode"?: string | null,"published_at"?: string | null,"remote_days"?: number,"response_days"?: number,"salary_max_k"?: number | null,"salary_min_k"?: number | null,"start_label"?: string | null,"status"?: Database["public"]['Enums']["offer_status"],"status_reason"?: string | null,"submitted_at"?: string | null,"team_description"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "address_label"?: string | null,"city"?: string | null,"closed_at"?: string | null,"company_id"?: string,"contract"?: Database["public"]['Enums']["contract_type"],"created_at"?: string,"created_by"?: string | null,"experience_band"?: Database["public"]['Enums']["experience_band"],"expires_at"?: string | null,"id"?: string,"interviews_count"?: number,"language_justification"?: string | null,"location"?: unknown,"manager_name"?: string | null,"manager_title"?: string | null,"missions"?: (string)[],"must_have"?: (string)[],"nice_to_have"?: (string)[],"postcode"?: string | null,"published_at"?: string | null,"remote_days"?: number,"response_days"?: number,"salary_max_k"?: number | null,"salary_min_k"?: number | null,"start_label"?: string | null,"status"?: Database["public"]['Enums']["offer_status"],"status_reason"?: string | null,"submitted_at"?: string | null,"team_description"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "offers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
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
                },"terms_acceptances": {
                  Row: {
                    "accepted_at": string,"user_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"user_id": string,"version": string
                  }
                  Update: {
                    "accepted_at"?: string,"user_id"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_access": {
                  Row: {
                    "copy_key": string | null,"created_at": string,"granted_at": string,"granted_by": string | null,"institution": string | null,"level": number | null,"referral_disabled": boolean,"source_submission_id": string | null,"study_field": Database["public"]['Enums']["study_field"] | null,"tier": Database["public"]['Enums']["access_tier"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "copy_key"?: string | null,"created_at"?: string,"granted_at"?: string,"granted_by"?: string | null,"institution"?: string | null,"level"?: number | null,"referral_disabled"?: boolean,"source_submission_id"?: string | null,"study_field"?: Database["public"]['Enums']["study_field"] | null,"tier": Database["public"]['Enums']["access_tier"],"user_id": string
                  }
                  Update: {
                    "copy_key"?: string | null,"created_at"?: string,"granted_at"?: string,"granted_by"?: string | null,"institution"?: string | null,"level"?: number | null,"referral_disabled"?: boolean,"source_submission_id"?: string | null,"study_field"?: Database["public"]['Enums']["study_field"] | null,"tier"?: Database["public"]['Enums']["access_tier"],"user_id"?: string
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
            "accept_emploi_terms":
{ Args: { "p_version": string }; Returns: undefined
                           },
"accept_interview_slot":
{ Args: { "p_slot_id": string }; Returns: undefined
                           },
"ack_notice":
{ Args: { "p_id": string }; Returns: undefined
                           },
"add_application_note":
{ Args: { "p_body": string,"p_id": string }; Returns: string
                           },
"admin_decide_company":
{ Args: { "p_decision": string,"p_id": string,"p_reason"?: string }; Returns: undefined
                           },
"admin_decide_offer":
{ Args: { "p_decision": string,"p_id": string,"p_reason"?: string }; Returns: undefined
                           },
"admin_emploi_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_get_submission":
{ Args: { "p_id": string }; Returns: {
              "attempts": number,"birthdate": string,"confidence": number,"created_at": string,"display_name": string,"doc_sha256": string,"email": string,"extracted": Json,"field_verified": Database["public"]['Enums']["study_field"],"file_deleted_at": string,"id": string,"institution_verified": string,"legal_name": string,"level_verified": number,"mime": string,"moderator_note": string,"rejection_reason": string,"reviewed_at": string,"reviewer_id": string,"signals": (string)[],"status": Database["public"]['Enums']["submission_status"],"storage_path": string,"user_id": string
            }[]
                           },
"admin_handle_offer_report":
{ Args: { "p_id": string,"p_reason"?: string,"p_status": Database["public"]['Enums']["report_status"],"p_unpublish"?: boolean }; Returns: undefined
                           },
"admin_list_companies":
{ Args: { "p_status"?: Database["public"]['Enums']["company_status"] }; Returns: Json[]
                           },
"admin_list_offer_reports":
{ Args: { "p_status"?: Database["public"]['Enums']["report_status"] }; Returns: Json[]
                           },
"admin_list_offers_to_review":
{ Args: Record<PropertyKey, never>; Returns: Json[]
                           },
"admin_list_submissions":
{ Args: { "p_status"?: Database["public"]['Enums']["submission_status"] }; Returns: {
              "attempts": number,"birthdate": string,"confidence": number,"created_at": string,"display_name": string,"doc_sha256": string,"email": string,"extracted": Json,"field_verified": Database["public"]['Enums']["study_field"],"file_deleted_at": string,"id": string,"institution_verified": string,"legal_name": string,"level_verified": number,"mime": string,"moderator_note": string,"rejection_reason": string,"reviewed_at": string,"reviewer_id": string,"signals": (string)[],"status": Database["public"]['Enums']["submission_status"],"storage_path": string,"user_id": string
            }[]
                           },
"admin_moderate_photo":
{ Args: { "p_decision": string,"p_photo_id": string,"p_reason"?: string }; Returns: undefined
                           },
"admin_set_member_institution":
{ Args: { "p_field": Database["public"]['Enums']["study_field"],"p_institution": string,"p_user": string }; Returns: undefined
                           },
"admin_update_settings":
{ Args: { "p_values": Json }; Returns: Json
                           },
"apply_diploma_review":
{ Args: { "p_decision": string,"p_field"?: Database["public"]['Enums']["study_field"],"p_institution"?: string,"p_level": number,"p_reason": string,"p_reviewer": string,"p_submission": string }; Returns: Json
                           },
"apply_offer":
{ Args: { "p_id": string,"p_note"?: string,"p_note_target"?: string }; Returns: Json
                           },
"block_company":
{ Args: { "p_company_id": string }; Returns: undefined
                           },
"can_view_offer_photo":
{ Args: { "path": string }; Returns: boolean
                           },
"close_offer":
{ Args: { "p_id": string,"p_reason": string }; Returns: number
                           },
"consume_rate_limit":
{ Args: { "p_bucket": string,"p_limit": number,"p_user": string,"p_window_seconds": number }; Returns: boolean
                           },
"decide_application":
{ Args: { "p_decision": string,"p_id": string,"p_message"?: string,"p_reason"?: Database["public"]['Enums']["refusal_reason"] }; Returns: Json
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
"emploi_requirement_matches":
{ Args: { "p_candidate": string,"p_offer": string }; Returns: Json
                           },
"export_my_emploi_data":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_application_messages":
{ Args: { "p_id": string }; Returns: Json[]
                           },
"get_company":
{ Args: { "p_id": string }; Returns: Json
                           },
"get_emploi_state":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_my_application":
{ Args: { "p_id": string }; Returns: Json
                           },
"get_my_applications":
{ Args: Record<PropertyKey, never>; Returns: Json[]
                           },
"get_my_candidate_identity":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_my_company":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_my_conversations":
{ Args: Record<PropertyKey, never>; Returns: Json[]
                           },
"get_my_cv":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_my_cv_preview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_my_invitations":
{ Args: Record<PropertyKey, never>; Returns: Json[]
                           },
"get_offer":
{ Args: { "p_id": string }; Returns: Json
                           },
"get_offer_feed":
{ Args: { "p_limit"?: number }; Returns: Json[]
                           },
"get_offer_for_edit":
{ Args: { "p_id": string }; Returns: Json
                           },
"get_offer_pile":
{ Args: { "p_limit"?: number,"p_offer_id": string }; Returns: Json[]
                           },
"get_recruiter_application":
{ Args: { "p_id": string }; Returns: Json
                           },
"inactive_accounts_to_purge":
{ Args: { "p_limit"?: number }; Returns: {
              "user_id": string
            }[]
                           },
"inactive_purge_eligible":
{ Args: { "p_user": string }; Returns: boolean
                           },
"invite_candidate":
{ Args: { "p_message": string,"p_number": number,"p_offer_id": string }; Returns: string
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin_account":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"list_company_offers":
{ Args: Record<PropertyKey, never>; Returns: Json[]
                           },
"list_my_company_blocks":
{ Args: Record<PropertyKey, never>; Returns: Json[]
                           },
"list_offer_applications":
{ Args: { "p_offer_id": string }; Returns: Json[]
                           },
"mark_application_seen":
{ Args: { "p_id": string }; Returns: undefined
                           },
"mark_diploma_purged":
{ Args: { "p_id": string }; Returns: undefined
                           },
"move_application":
{ Args: { "p_id": string,"p_status": Database["public"]['Enums']["application_status"] }; Returns: undefined
                           },
"pass_offer":
{ Args: { "p_id": string }; Returns: undefined
                           },
"propose_interview_slots":
{ Args: { "p_id": string,"p_slots": Json }; Returns: number
                           },
"register_company":
{ Args: { "p_display_name": string,"p_first_name"?: string,"p_job_title": string,"p_siren": string,"p_sirene": Json }; Returns: string
                           },
"report_offer":
{ Args: { "p_details"?: string,"p_offer_id": string,"p_reason": Database["public"]['Enums']["offer_report_reason"] }; Returns: string
                           },
"respond_invitation":
{ Args: { "p_accept": boolean,"p_id": string }; Returns: Json
                           },
"save_candidate_profile":
{ Args: { "p": Json }; Returns: Json
                           },
"save_cv":
{ Args: { "p_experiences": Json,"p_languages": Json,"p_skills": (string)[] }; Returns: Json
                           },
"save_offer":
{ Args: { "p_fields": Json,"p_id": string }; Returns: string
                           },
"search_companies":
{ Args: { "p_q": string }; Returns: Json[]
                           },
"search_open_candidates":
{ Args: { "p_min_level"?: number,"p_offer_id": string,"p_skill"?: string }; Returns: Json[]
                           },
"send_application_message":
{ Args: { "p_body": string,"p_context"?: string,"p_id": string }; Returns: string
                           },
"server_emploi_notification":
{ Args: { "p_event": string,"p_id": string }; Returns: Json
                           },
"server_get_identity":
{ Args: { "p_user": string }; Returns: {
              "birthdate": string,"legal_name": string
            }[]
                           },
"server_prepare_account_deletion":
{ Args: { "p_user": string }; Returns: Json
                           },
"set_account_kind":
{ Args: { "p_kind": Database["public"]['Enums']["emploi_account_kind"] }; Returns: undefined
                           },
"set_candidate_identity":
{ Args: { "p_first_name": string,"p_last_name": string }; Returns: undefined
                           },
"submit_offer":
{ Args: { "p_id": string }; Returns: Json
                           },
"unblock_company":
{ Args: { "p_company_id": string }; Returns: undefined
                           },
"update_company_profile":
{ Args: { "p_description"?: string,"p_display_name"?: string,"p_website"?: string }; Returns: undefined
                           },
"update_my_member_profile":
{ Args: { "p_first_name"?: string,"p_job_title"?: string }; Returns: undefined
                           },
"withdraw_application":
{ Args: { "p_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "access_tier": "unlimited"|"standard"|"waitlist"|"refused","admin_role": "moderator"|"owner","application_status": "sent"|"seen"|"interested"|"interview"|"offer_made"|"hired"|"rejected"|"closed_no_response"|"withdrawn","company_role": "owner"|"recruiter","company_status": "pending"|"verified"|"rejected"|"suspended","contract_type": "cdi"|"cdd","emploi_account_kind": "candidate"|"recruiter","experience_band": "y0_1"|"y1_3"|"y3_5"|"y5_plus","interview_mode": "visio"|"onsite","invitation_status": "sent"|"applied"|"declined","language_level": "a2"|"b1"|"b2"|"c1"|"c2","offer_photo_kind": "workplace"|"manager"|"team"|"tools"|"area","offer_report_reason": "fake"|"discriminatory"|"misleading_salary"|"scam"|"other","offer_status": "draft"|"pending_review"|"published"|"rejected"|"filled"|"expired"|"archived","photo_moderation": "pending"|"approved"|"rejected","push_platform": "ios"|"android"|"web","refusal_reason": "experience"|"skills"|"position_filled"|"other_profile"|"other","report_status": "open"|"actioned"|"dismissed","slot_status": "proposed"|"accepted"|"declined"|"cancelled","study_field": "education"|"arts"|"letters"|"philosophy"|"history"|"social_sciences"|"economics"|"law"|"sciences"|"mathematics"|"computing"|"engineering"|"agronomy"|"health","submission_status": "pending"|"processing"|"needs_review"|"approved"|"rejected"|"needs_more"
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
            "access_tier": ["unlimited", "standard", "waitlist", "refused"],"admin_role": ["moderator", "owner"],"application_status": ["sent", "seen", "interested", "interview", "offer_made", "hired", "rejected", "closed_no_response", "withdrawn"],"company_role": ["owner", "recruiter"],"company_status": ["pending", "verified", "rejected", "suspended"],"contract_type": ["cdi", "cdd"],"emploi_account_kind": ["candidate", "recruiter"],"experience_band": ["y0_1", "y1_3", "y3_5", "y5_plus"],"interview_mode": ["visio", "onsite"],"invitation_status": ["sent", "applied", "declined"],"language_level": ["a2", "b1", "b2", "c1", "c2"],"offer_photo_kind": ["workplace", "manager", "team", "tools", "area"],"offer_report_reason": ["fake", "discriminatory", "misleading_salary", "scam", "other"],"offer_status": ["draft", "pending_review", "published", "rejected", "filled", "expired", "archived"],"photo_moderation": ["pending", "approved", "rejected"],"push_platform": ["ios", "android", "web"],"refusal_reason": ["experience", "skills", "position_filled", "other_profile", "other"],"report_status": ["open", "actioned", "dismissed"],"slot_status": ["proposed", "accepted", "declined", "cancelled"],"study_field": ["education", "arts", "letters", "philosophy", "history", "social_sciences", "economics", "law", "sciences", "mathematics", "computing", "engineering", "agronomy", "health"],"submission_status": ["pending", "processing", "needs_review", "approved", "rejected", "needs_more"]
          }
        }
} as const
