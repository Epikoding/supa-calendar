export interface Database {
  public: {
    Tables: {
      brands: {
        Row: {
          id: number
          code: string
          name: string
          drive_root: string | null
          color: string | null
          sort_order: number
          calendar_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          code: string
          name: string
          drive_root?: string | null
          color?: string | null
          sort_order?: number
          calendar_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          code?: string
          name?: string
          drive_root?: string | null
          color?: string | null
          sort_order?: number
          calendar_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      members: {
        Row: {
          id: number
          name: string
          name_short: string
          role: string | null
          slack_id: string | null
          email: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          name: string
          name_short: string
          role?: string | null
          slack_id?: string | null
          email?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          name?: string
          name_short?: string
          role?: string | null
          slack_id?: string | null
          email?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: number
          brand_id: number
          parent_id: number | null
          name: string
          drive_path: string | null
          date_start: string | null
          date_end: string | null
          status: '진행전' | '진행중' | '보류' | '완료' | '드랍'
          settled: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          brand_id: number
          parent_id?: number | null
          name: string
          drive_path?: string | null
          date_start?: string | null
          date_end?: string | null
          status?: '진행전' | '진행중' | '보류' | '완료' | '드랍'
          settled?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          brand_id?: number
          parent_id?: number | null
          name?: string
          drive_path?: string | null
          date_start?: string | null
          date_end?: string | null
          status?: '진행전' | '진행중' | '보류' | '완료' | '드랍'
          settled?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'projects_brand_id_fkey'
            columns: ['brand_id']
            isOneToOne: false
            referencedRelation: 'brands'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'projects_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      project_links: {
        Row: {
          id: number
          project_id: number
          url: string
          title: string
          link_type: 'channel' | 'message' | 'reply'
          channel_id: string | null
          channel_name: string | null
          thread_date: string | null
          is_open: boolean
          created_at: string
        }
        Insert: {
          id?: number
          project_id: number
          url: string
          title: string
          link_type?: 'channel' | 'message' | 'reply'
          channel_id?: string | null
          channel_name?: string | null
          thread_date?: string | null
          is_open?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          project_id?: number
          url?: string
          title?: string
          link_type?: 'channel' | 'message' | 'reply'
          channel_id?: string | null
          channel_name?: string | null
          thread_date?: string | null
          is_open?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'project_links_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      project_members: {
        Row: {
          project_id: number
          member_id: number
          role: string
        }
        Insert: {
          project_id: number
          member_id: number
          role: string
        }
        Update: {
          project_id?: number
          member_id?: number
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: 'project_members_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'project_members_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
        ]
      }
      project_roles: {
        Row: {
          id: number
          key: string
          label: string
          color: string | null
          sort_order: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: number
          key: string
          label: string
          color?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          key?: string
          label?: string
          color?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      schedule: {
        Row: {
          id: number
          project_id: number
          date: string
          time: string | null
          content: string | null
          content_internal: string | null
          note: string | null
          date_uncertain: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          project_id: number
          date: string
          time?: string | null
          content?: string | null
          content_internal?: string | null
          note?: string | null
          date_uncertain?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          project_id?: number
          date?: string
          time?: string | null
          content?: string | null
          content_internal?: string | null
          note?: string | null
          date_uncertain?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'schedule_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      schedule_assignees: {
        Row: {
          schedule_id: number
          member_id: number
        }
        Insert: {
          schedule_id: number
          member_id: number
        }
        Update: {
          schedule_id?: number
          member_id?: number
        }
        Relationships: [
          {
            foreignKeyName: 'schedule_assignees_schedule_id_fkey'
            columns: ['schedule_id']
            isOneToOne: false
            referencedRelation: 'schedule'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'schedule_assignees_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
        ]
      }
      attendance: {
        Row: {
          id: number
          date: string
          location: string | null
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          date: string
          location?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          date?: string
          location?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          id: number
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: number
          name?: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          name?: string
          description?: string | null
          created_at?: string
        }
        Relationships: []
      }
      scenario_schedules: {
        Row: {
          id: number
          scenario_id: number
          project_id: number
          date_start: string
          date_end: string
          created_at: string
        }
        Insert: {
          id?: number
          scenario_id: number
          project_id: number
          date_start: string
          date_end: string
          created_at?: string
        }
        Update: {
          id?: number
          scenario_id?: number
          project_id?: number
          date_start?: string
          date_end?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'scenario_schedules_scenario_id_fkey'
            columns: ['scenario_id']
            isOneToOne: false
            referencedRelation: 'scenarios'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'scenario_schedules_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      keyword_highlights: {
        Row: {
          id: number
          keyword: string
          color: string
          is_regex: boolean
          show_header_dot: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          keyword: string
          color: string
          is_regex?: boolean
          show_header_dot?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          keyword?: string
          color?: string
          is_regex?: boolean
          show_header_dot?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_members: {
        Row: {
          attendance_id: number
          member_id: number
          note: string | null
        }
        Insert: {
          attendance_id: number
          member_id: number
          note?: string | null
        }
        Update: {
          attendance_id?: number
          member_id?: number
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'attendance_members_attendance_id_fkey'
            columns: ['attendance_id']
            isOneToOne: false
            referencedRelation: 'attendance'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attendance_members_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      save_schedule: {
        Args: {
          p_schedule_id: number
          p_time?: string | null
          p_content?: string | null
          p_content_internal?: string | null
          p_note?: string | null
          p_date_uncertain?: boolean
          p_assignee_ids?: number[]
        }
        Returns: undefined
      }
      delete_schedule: {
        Args: {
          p_schedule_id: number
        }
        Returns: undefined
      }
      create_schedule: {
        Args: {
          p_project_id: number
          p_date: string
          p_time?: string | null
          p_content?: string | null
          p_content_internal?: string | null
          p_note?: string | null
          p_date_uncertain?: boolean
          p_assignee_ids?: number[]
        }
        Returns: number
      }
      batch_move_items: {
        Args: {
          p_projects?: {
            id: number
            date_start?: string
            date_end?: string
            sort_order?: number
            parent_id?: number | null
          }[]
          p_schedules?: { id: number; date: string; project_id?: number }[]
          p_scenario_schedules?: { id: number; date_start: string; date_end: string }[]
        }
        Returns: undefined
      }
    }
  }
}

// 편의 타입
export type Brand = Database['public']['Tables']['brands']['Row']
export type Member = Database['public']['Tables']['members']['Row']
export type Project = Database['public']['Tables']['projects']['Row']
export type ProjectMember = Database['public']['Tables']['project_members']['Row']
export type Schedule = Database['public']['Tables']['schedule']['Row']
export type ScheduleAssignee = Database['public']['Tables']['schedule_assignees']['Row']
export type Attendance = Database['public']['Tables']['attendance']['Row']
export type AttendanceMember = Database['public']['Tables']['attendance_members']['Row']
export type Scenario = Database['public']['Tables']['scenarios']['Row']
export type ScenarioSchedule = Database['public']['Tables']['scenario_schedules']['Row']
export type KeywordHighlight = Database['public']['Tables']['keyword_highlights']['Row']
export type ProjectLink = Database['public']['Tables']['project_links']['Row']

// 관계 포함 타입 (JOIN 결과용)
export type ProjectWithBrand = Project & { brand: Brand }
export type ProjectWithMembers = Project & {
  brand: Brand
  designers: Member[]
  pms: Member[]
  children?: ProjectWithMembers[]
}
export type ScheduleWithAssignees = Schedule & { assignees: Member[] }
