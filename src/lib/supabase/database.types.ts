// GENERATED FILE — do not edit. Regenerate with `npm run types:gen`.
//
// The schema this project's client is bound to (ADR-416 gate 1 rule 1). Import
// it through @/lib/supabase, never from here directly: that module is
// where RPC argument nullability is corrected, and it explains why.
//
// The trailing stamp fingerprints supabase/migrations/ at generation time.
// scripts/governance/check-db-types.mjs recomputes it, so a migration added
// without regenerating fails the build instead of rotting quietly.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          detail: Json
          id: number
          season_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          detail?: Json
          id?: never
          season_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          detail?: Json
          id?: never
          season_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      bids: {
        Row: {
          amount: number
          created_at: string
          film_id: string
          id: string
          is_winning: boolean | null
          season_member_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          film_id: string
          id?: string
          is_winning?: boolean | null
          season_member_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          film_id?: string
          id?: string
          is_winning?: boolean | null
          season_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bids_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_season_member_id_fkey"
            columns: ["season_member_id"]
            isOneToOne: false
            referencedRelation: "season_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_season_member_id_fkey"
            columns: ["season_member_id"]
            isOneToOne: false
            referencedRelation: "v_standings"
            referencedColumns: ["season_member_id"]
          },
        ]
      }
      calendar_weeks: {
        Row: {
          end_date: string
          id: number
          iso_year: number
          start_date: string
          week_number: number
        }
        Insert: {
          end_date: string
          id?: never
          iso_year: number
          start_date: string
          week_number: number
        }
        Update: {
          end_date?: string
          id?: never
          iso_year?: number
          start_date?: string
          week_number?: number
        }
        Relationships: []
      }
      email_log: {
        Row: {
          created_at: string
          error: string | null
          id: number
          kind: string
          profile_id: string
          season_id: string | null
          status: string
          week_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: never
          kind: string
          profile_id: string
          season_id?: string | null
          status: string
          week_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: never
          kind?: string
          profile_id?: string
          season_id?: string | null
          status?: string
          week_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      film_cast: {
        Row: {
          billing: number
          character_name: string | null
          name: string
          person_id: number
          profile_path: string | null
          tmdb_id: number
        }
        Insert: {
          billing: number
          character_name?: string | null
          name: string
          person_id: number
          profile_path?: string | null
          tmdb_id: number
        }
        Update: {
          billing?: number
          character_name?: string | null
          name?: string
          person_id?: number
          profile_path?: string | null
          tmdb_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "film_cast_tmdb_id_fkey"
            columns: ["tmdb_id"]
            isOneToOne: false
            referencedRelation: "film_catalog"
            referencedColumns: ["tmdb_id"]
          },
        ]
      }
      film_catalog: {
        Row: {
          awards_text: string | null
          backdrop_path: string | null
          box_office_domestic: number | null
          budget: number | null
          certification: string | null
          cinematographer: string | null
          collection_id: number | null
          collection_name: string | null
          composer: string | null
          created_at: string
          director: string | null
          fetched_at: string
          homepage: string | null
          imdb_id: string | null
          imdb_rating: number | null
          imdb_votes: number | null
          metascore: number | null
          metrics_refreshed_at: string | null
          original_language: string | null
          original_title: string | null
          overview: string | null
          poster_path: string | null
          release_date_digital: string | null
          release_date_tmdb_raw: string | null
          release_date_us_limited: string | null
          release_date_us_premiere: string | null
          release_date_us_wide: string | null
          release_year: number | null
          revenue_worldwide: number | null
          rt_tomatometer: number | null
          runtime_min: number | null
          tagline: string | null
          title: string
          tmdb_id: number
          tmdb_popularity_at_pick: number | null
          tmdb_vote_average: number | null
          tmdb_vote_count: number | null
          trailer_youtube_key: string | null
        }
        Insert: {
          awards_text?: string | null
          backdrop_path?: string | null
          box_office_domestic?: number | null
          budget?: number | null
          certification?: string | null
          cinematographer?: string | null
          collection_id?: number | null
          collection_name?: string | null
          composer?: string | null
          created_at?: string
          director?: string | null
          fetched_at?: string
          homepage?: string | null
          imdb_id?: string | null
          imdb_rating?: number | null
          imdb_votes?: number | null
          metascore?: number | null
          metrics_refreshed_at?: string | null
          original_language?: string | null
          original_title?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date_digital?: string | null
          release_date_tmdb_raw?: string | null
          release_date_us_limited?: string | null
          release_date_us_premiere?: string | null
          release_date_us_wide?: string | null
          release_year?: number | null
          revenue_worldwide?: number | null
          rt_tomatometer?: number | null
          runtime_min?: number | null
          tagline?: string | null
          title: string
          tmdb_id: number
          tmdb_popularity_at_pick?: number | null
          tmdb_vote_average?: number | null
          tmdb_vote_count?: number | null
          trailer_youtube_key?: string | null
        }
        Update: {
          awards_text?: string | null
          backdrop_path?: string | null
          box_office_domestic?: number | null
          budget?: number | null
          certification?: string | null
          cinematographer?: string | null
          collection_id?: number | null
          collection_name?: string | null
          composer?: string | null
          created_at?: string
          director?: string | null
          fetched_at?: string
          homepage?: string | null
          imdb_id?: string | null
          imdb_rating?: number | null
          imdb_votes?: number | null
          metascore?: number | null
          metrics_refreshed_at?: string | null
          original_language?: string | null
          original_title?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date_digital?: string | null
          release_date_tmdb_raw?: string | null
          release_date_us_limited?: string | null
          release_date_us_premiere?: string | null
          release_date_us_wide?: string | null
          release_year?: number | null
          revenue_worldwide?: number | null
          rt_tomatometer?: number | null
          runtime_min?: number | null
          tagline?: string | null
          title?: string
          tmdb_id?: number
          tmdb_popularity_at_pick?: number | null
          tmdb_vote_average?: number | null
          tmdb_vote_count?: number | null
          trailer_youtube_key?: string | null
        }
        Relationships: []
      }
      film_genres: {
        Row: {
          genre_id: number
          name: string
          tmdb_id: number
        }
        Insert: {
          genre_id: number
          name: string
          tmdb_id: number
        }
        Update: {
          genre_id?: number
          name?: string
          tmdb_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "film_genres_tmdb_id_fkey"
            columns: ["tmdb_id"]
            isOneToOne: false
            referencedRelation: "film_catalog"
            referencedColumns: ["tmdb_id"]
          },
        ]
      }
      film_ratings: {
        Row: {
          checked_at: string
          fetch_error: string | null
          fetched_at: string | null
          imdb_id: string
          tomatometer: number | null
        }
        Insert: {
          checked_at?: string
          fetch_error?: string | null
          fetched_at?: string | null
          imdb_id: string
          tomatometer?: number | null
        }
        Update: {
          checked_at?: string
          fetch_error?: string | null
          fetched_at?: string | null
          imdb_id?: string
          tomatometer?: number | null
        }
        Relationships: []
      }
      films: {
        Row: {
          box_office_m: number | null
          captured_at: string | null
          created_at: string
          eligible: boolean
          id: string
          imdb_id: string | null
          release_calendar_week_id: number | null
          release_date: string | null
          removed_reason: string | null
          score: number | null
          status: Database["public"]["Enums"]["film_status"]
          title: string
          tmdb_id: number
          tomatometer: number | null
          week_id: string
        }
        Insert: {
          box_office_m?: number | null
          captured_at?: string | null
          created_at?: string
          eligible?: boolean
          id?: string
          imdb_id?: string | null
          release_calendar_week_id?: number | null
          release_date?: string | null
          removed_reason?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["film_status"]
          title: string
          tmdb_id: number
          tomatometer?: number | null
          week_id: string
        }
        Update: {
          box_office_m?: number | null
          captured_at?: string | null
          created_at?: string
          eligible?: boolean
          id?: string
          imdb_id?: string | null
          release_calendar_week_id?: number | null
          release_date?: string | null
          removed_reason?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["film_status"]
          title?: string
          tmdb_id?: number
          tomatometer?: number | null
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "films_release_calendar_week_id_fkey"
            columns: ["release_calendar_week_id"]
            isOneToOne: false
            referencedRelation: "calendar_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "films_tmdb_id_fkey"
            columns: ["tmdb_id"]
            isOneToOne: false
            referencedRelation: "film_catalog"
            referencedColumns: ["tmdb_id"]
          },
          {
            foreignKeyName: "films_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      league_announcements: {
        Row: {
          author_id: string
          body: string | null
          created_at: string
          id: string
          league_id: string
          title: string
        }
        Insert: {
          author_id: string
          body?: string | null
          created_at?: string
          id?: string
          league_id: string
          title: string
        }
        Update: {
          author_id?: string
          body?: string | null
          created_at?: string
          id?: string
          league_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_announcements_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          id: string
          league_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          expires_at?: string
          id?: string
          league_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          id?: string
          league_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_invites_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          created_at: string
          id: string
          league_id: string
          profile_id: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          profile_id: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_settings: {
        Row: {
          bids_due_dow: number
          bids_due_time: string
          bids_due_tz: string
          buy_in: number
          created_at: string
          default_season_length: number
          fake_bankroll: number
          id: string
          league_id: string
          league_type: string
          min_bid: number
          payout_structure: Json
          side_bets_enabled: boolean
          top_n_distinct: number
        }
        Insert: {
          bids_due_dow?: number
          bids_due_time?: string
          bids_due_tz?: string
          buy_in?: number
          created_at?: string
          default_season_length?: number
          fake_bankroll?: number
          id?: string
          league_id: string
          league_type?: string
          min_bid?: number
          payout_structure?: Json
          side_bets_enabled?: boolean
          top_n_distinct?: number
        }
        Update: {
          bids_due_dow?: number
          bids_due_time?: string
          bids_due_tz?: string
          buy_in?: number
          created_at?: string
          default_season_length?: number
          fake_bankroll?: number
          id?: string
          league_id?: string
          league_type?: string
          min_bid?: number
          payout_structure?: Json
          side_bets_enabled?: boolean
          top_n_distinct?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_rule_defaults_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          notify_bids_revealed: boolean
          notify_results_up: boolean
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name: string
          email: string
          id: string
          notify_bids_revealed?: boolean
          notify_results_up?: boolean
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          notify_bids_revealed?: boolean
          notify_results_up?: boolean
        }
        Relationships: []
      }
      season_members: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          role: Database["public"]["Enums"]["member_role"]
          season_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          role?: Database["public"]["Enums"]["member_role"]
          season_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_members_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_members_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      season_settings: {
        Row: {
          bids_due_dow: number
          bids_due_time: string
          bids_due_tz: string
          buy_in: number
          created_at: string
          default_season_length: number
          fake_bankroll: number
          league_type: string
          min_bid: number
          payout_structure: Json
          season_id: string
          side_bets_enabled: boolean
          top_n_distinct: number
        }
        Insert: {
          bids_due_dow?: number
          bids_due_time?: string
          bids_due_tz?: string
          buy_in?: number
          created_at?: string
          default_season_length?: number
          fake_bankroll?: number
          league_type?: string
          min_bid?: number
          payout_structure?: Json
          season_id: string
          side_bets_enabled?: boolean
          top_n_distinct?: number
        }
        Update: {
          bids_due_dow?: number
          bids_due_time?: string
          bids_due_tz?: string
          buy_in?: number
          created_at?: string
          default_season_length?: number
          fake_bankroll?: number
          league_type?: string
          min_bid?: number
          payout_structure?: Json
          season_id?: string
          side_bets_enabled?: boolean
          top_n_distinct?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_settings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_settings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "v_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          league_id: string
          status: Database["public"]["Enums"]["season_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          league_id: string
          status?: Database["public"]["Enums"]["season_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          league_id?: string
          status?: Database["public"]["Enums"]["season_status"]
        }
        Relationships: [
          {
            foreignKeyName: "seasons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_lines: {
        Row: {
          breakdown: Json
          id: string
          net: number
          owing: number
          paid: boolean
          season_member_id: string
          settlement_id: string
          won: number
        }
        Insert: {
          breakdown?: Json
          id?: string
          net?: number
          owing?: number
          paid?: boolean
          season_member_id: string
          settlement_id: string
          won?: number
        }
        Update: {
          breakdown?: Json
          id?: string
          net?: number
          owing?: number
          paid?: boolean
          season_member_id?: string
          settlement_id?: string
          won?: number
        }
        Relationships: [
          {
            foreignKeyName: "settlement_lines_season_member_id_fkey"
            columns: ["season_member_id"]
            isOneToOne: false
            referencedRelation: "season_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_lines_season_member_id_fkey"
            columns: ["season_member_id"]
            isOneToOne: false
            referencedRelation: "v_standings"
            referencedColumns: ["season_member_id"]
          },
          {
            foreignKeyName: "settlement_lines_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_payments: {
        Row: {
          amount: number
          id: string
          note: string | null
          recorded_at: string
          recorded_by: string | null
          season_member_id: string
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          id?: string
          note?: string | null
          recorded_at?: string
          recorded_by?: string | null
          season_member_id: string
          status: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          id?: string
          note?: string | null
          recorded_at?: string
          recorded_by?: string | null
          season_member_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "settlement_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_payments_season_member_id_fkey"
            columns: ["season_member_id"]
            isOneToOne: true
            referencedRelation: "season_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_payments_season_member_id_fkey"
            columns: ["season_member_id"]
            isOneToOne: true
            referencedRelation: "v_standings"
            referencedColumns: ["season_member_id"]
          },
        ]
      }
      settlements: {
        Row: {
          generated_at: string
          id: string
          payout_snapshot: Json
          season_id: string
          status: Database["public"]["Enums"]["settlement_status"]
        }
        Insert: {
          generated_at?: string
          id?: string
          payout_snapshot?: Json
          season_id: string
          status?: Database["public"]["Enums"]["settlement_status"]
        }
        Update: {
          generated_at?: string
          id?: string
          payout_snapshot?: Json
          season_id?: string
          status?: Database["public"]["Enums"]["settlement_status"]
        }
        Relationships: [
          {
            foreignKeyName: "settlements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      weeks: {
        Row: {
          bid_deadline: string | null
          bid_deadline_override: string | null
          calendar_week_id: number | null
          created_at: string
          id: string
          number: number
          opening_date: string
          season_id: string
          status: Database["public"]["Enums"]["week_status"]
          week_of: string | null
        }
        Insert: {
          bid_deadline?: string | null
          bid_deadline_override?: string | null
          calendar_week_id?: number | null
          created_at?: string
          id?: string
          number: number
          opening_date: string
          season_id: string
          status?: Database["public"]["Enums"]["week_status"]
          week_of?: string | null
        }
        Update: {
          bid_deadline?: string | null
          bid_deadline_override?: string | null
          calendar_week_id?: number | null
          created_at?: string
          id?: string
          number?: number
          opening_date?: string
          season_id?: string
          status?: Database["public"]["Enums"]["week_status"]
          week_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weeks_calendar_week_id_fkey"
            columns: ["calendar_week_id"]
            isOneToOne: false
            referencedRelation: "calendar_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_season_awards: {
        Row: {
          best_ratio: number | null
          dessert_films: Json | null
          dessert_member_ids: string[] | null
          efficiency_films: Json | null
          efficiency_member_ids: string[] | null
          season_id: string | null
          worst_ratio: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      v_seasons: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string | null
          league_id: string | null
          name: string | null
          number: number | null
          status: Database["public"]["Enums"]["season_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "seasons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      v_standings: {
        Row: {
          display_name: string | null
          efficiency: number | null
          films_owned: number | null
          points: number | null
          profile_id: string | null
          role: Database["public"]["Enums"]["member_role"] | null
          season_id: string | null
          season_member_id: string | null
          spent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "season_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_members_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_members_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_league_invite: {
        Args: { p_invite_id?: string; p_token?: string }
        Returns: string
      }
      add_films_from_catalog: {
        Args: {
          p_allow_create_week?: boolean
          p_films: Json
          p_season_id: string
        }
        Returns: Json
      }
      add_league_member: {
        Args: {
          p_email: string
          p_league_id: string
          p_role?: Database["public"]["Enums"]["member_role"]
        }
        Returns: string
      }
      add_season_member: {
        Args: { p_email: string; p_season_id: string }
        Returns: string
      }
      announcement_title_from_body: {
        Args: { p_body: string }
        Returns: string
      }
      calendar_week_id_for: { Args: { p_date: string }; Returns: number }
      capture_film: {
        Args: {
          p_box_office_m: number
          p_film_id: string
          p_suggested?: Json
          p_tomatometer: number
        }
        Returns: undefined
      }
      clear_settlement_payment: {
        Args: { p_season_member_id: string }
        Returns: undefined
      }
      close_week: {
        Args: { p_auto?: boolean; p_week_id: string }
        Returns: undefined
      }
      commit_week_results: {
        Args: { p_results: Json; p_week_id: string }
        Returns: undefined
      }
      create_league: {
        Args: { p_league_type?: string; p_name: string }
        Returns: string
      }
      create_league_invite: {
        Args: { p_email?: string; p_league_id: string; p_profile_id?: string }
        Returns: {
          email: string
          expires_at: string
          id: string
          token: string
        }[]
      }
      create_season: {
        Args: {
          p_bids_due_dow?: number
          p_bids_due_time?: string
          p_bids_due_tz?: string
          p_buy_in?: number
          p_default_season_length?: number
          p_fake_bankroll?: number
          p_first_opening_date: string
          p_league_id: string
          p_min_bid?: number
          p_payout_structure?: Json
          p_side_bets_enabled?: boolean
          p_top_n_distinct?: number
        }
        Returns: string
      }
      create_week: {
        Args: {
          p_bid_deadline?: string
          p_number: number
          p_opening_date: string
          p_season_id: string
        }
        Returns: string
      }
      current_member_id: { Args: { p_season_id: string }; Returns: string }
      decline_league_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      delete_film: { Args: { p_film_id: string }; Returns: undefined }
      delete_league_announcement: { Args: { p_id: string }; Returns: undefined }
      delete_week: { Args: { p_week_id: string }; Returns: undefined }
      demote_league_commissioner: {
        Args: { p_member_id: string }
        Returns: undefined
      }
      finalize_settlement: {
        Args: { p_settlement_id: string }
        Returns: undefined
      }
      finalize_week: { Args: { p_week_id: string }; Returns: undefined }
      generate_settlement: { Args: { p_season_id: string }; Returns: string }
      get_league_activity: {
        Args: { p_league_id: string; p_limit?: number }
        Returns: {
          action: string
          actor_id: string
          actor_name: string
          at: string
          id: number
          season_id: string
          season_name: string
          week_number: number
        }[]
      }
      get_league_payments: {
        Args: { p_league_id: string }
        Returns: {
          amount: number
          display_name: string
          net: number
          profile_id: string
          recorded_at: string
          season_id: string
          season_member_id: string
          season_name: string
          status: string
        }[]
      }
      get_my_league_invites: {
        Args: never
        Returns: {
          expires_at: string
          id: string
          invited_by: string
          invited_by_id: string
          league_id: string
          league_name: string
        }[]
      }
      get_player_profile: {
        Args: { p_profile_id: string }
        Returns: {
          best_finish: number
          bio: string
          display_name: string
          films_owned: number
          is_me: boolean
          member_since: string
          profile_id: string
          seasons_played: number
          seasons_won: number
          shared_leagues: string[]
          total_points: number
          total_spent: number
        }[]
      }
      get_player_seasons: {
        Args: { p_profile_id: string }
        Returns: {
          films_owned: number
          league_name: string
          place: number
          player_count: number
          points: number
          season_id: string
          season_name: string
          season_status: string
          spent: number
        }[]
      }
      get_week_overrides: {
        Args: { p_week_id: string }
        Returns: {
          action: string
          actor_id: string
          actor_name: string
          at: string
          detail: Json
          id: number
          title: string
        }[]
      }
      handoff_league_commissioner: {
        Args: { p_to_member_id: string }
        Returns: undefined
      }
      ingest_completed_season: {
        Args: { p_league_id: string; p_payload: Json }
        Returns: Json
      }
      is_commissioner: { Args: { p_season_id: string }; Returns: boolean }
      is_league_commissioner: {
        Args: { p_league_id: string }
        Returns: boolean
      }
      is_league_member: { Args: { p_league_id: string }; Returns: boolean }
      is_own_member: { Args: { p_season_member_id: string }; Returns: boolean }
      is_season_member: { Args: { p_season_id: string }; Returns: boolean }
      iso_weekday_name: { Args: { p_dow: number }; Returns: string }
      league_default_bid_deadline: {
        Args: { p_dow: number; p_time: string; p_tz: string; p_week_of: string }
        Returns: string
      }
      member_remaining_budget: {
        Args: { p_season_member_id: string }
        Returns: number
      }
      move_film_to_week: {
        Args: {
          p_film_id: string
          p_reason?: string
          p_release_date: string
          p_target_week_id: string
        }
        Returns: string
      }
      open_due_weeks: { Args: { p_season_id?: string }; Returns: number }
      open_due_weeks_for_season: {
        Args: { p_season_id: string }
        Returns: number
      }
      open_week: { Args: { p_week_id: string }; Returns: undefined }
      override_bid_amount: {
        Args: { p_amount: number; p_bid_id: string; p_reason: string }
        Returns: undefined
      }
      peek_league_invite: {
        Args: { p_token: string }
        Returns: {
          already_member: boolean
          bankroll: number
          expired: boolean
          joins_current_season: boolean
          league_name: string
          member_count: number
          targeted_at: string
          winning_tiers: number
        }[]
      }
      place_bid: {
        Args: { p_amount: number; p_film_id: string }
        Returns: string
      }
      place_bids: { Args: { p_bids: Json }; Returns: number }
      post_league_announcement: {
        Args: { p_body: string; p_league_id: string; p_title?: string }
        Returns: string
      }
      promote_league_commissioner: {
        Args: { p_member_id: string }
        Returns: undefined
      }
      ratings_refresh_targets: {
        Args: { p_max?: number; p_stale_hours?: number }
        Returns: {
          imdb_id: string
        }[]
      }
      record_email: {
        Args: {
          p_error?: string
          p_kind: string
          p_profile_id: string
          p_status: string
          p_week_id: string
        }
        Returns: undefined
      }
      record_film_rating: {
        Args: { p_error?: string; p_imdb_id: string; p_tomatometer?: number }
        Returns: undefined
      }
      record_season_email: {
        Args: {
          p_error?: string
          p_kind: string
          p_profile_id: string
          p_season_id: string
          p_status: string
        }
        Returns: undefined
      }
      record_settlement_payment: {
        Args: {
          p_amount: number
          p_note?: string
          p_season_member_id: string
          p_status: Database["public"]["Enums"]["payment_status"]
        }
        Returns: undefined
      }
      remove_film: {
        Args: { p_film_id: string; p_reason: string }
        Returns: undefined
      }
      remove_ingested_season: { Args: { p_season_id: string }; Returns: Json }
      remove_league_member: {
        Args: { p_member_id: string }
        Returns: undefined
      }
      remove_season_member: {
        Args: { p_member_id: string }
        Returns: undefined
      }
      revoke_league_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      run_bidding_automation: { Args: never; Returns: number }
      run_notify_sweep: { Args: never; Returns: undefined }
      search_invitable_profiles: {
        Args: { p_league_id?: string; p_query?: string }
        Returns: {
          already_member: boolean
          display_name: string
          profile_id: string
        }[]
      }
      season_bidding_has_begun: {
        Args: { p_season_id: string }
        Returns: boolean
      }
      seed_season_weeks: {
        Args: {
          p_first_opening_date: string
          p_season_id: string
          p_week_count: number
        }
        Returns: number
      }
      set_league_member_role: {
        Args: {
          p_member_id: string
          p_role: Database["public"]["Enums"]["member_role"]
        }
        Returns: undefined
      }
      set_notify_secret: { Args: { p_secret: string }; Returns: undefined }
      set_week_bid_deadline: {
        Args: { p_deadline: string; p_week_id: string }
        Returns: string
      }
      settings_for_season: {
        Args: { p_season_id: string }
        Returns: {
          bids_due_dow: number
          bids_due_time: string
          bids_due_tz: string
          buy_in: number
          created_at: string
          default_season_length: number
          fake_bankroll: number
          id: string
          league_id: string
          league_type: string
          min_bid: number
          payout_structure: Json
          side_bets_enabled: boolean
          top_n_distinct: number
        }
        SetofOptions: {
          from: "*"
          to: "league_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      skip_week: { Args: { p_week_id: string }; Returns: undefined }
      sync_week_deadlines: { Args: { p_season_id: string }; Returns: number }
      unskip_week: { Args: { p_week_id: string }; Returns: undefined }
      update_bio: { Args: { p_bio: string }; Returns: undefined }
      update_display_name: { Args: { p_name: string }; Returns: undefined }
      update_email_preferences: {
        Args: { p_bids_revealed: boolean; p_results_up: boolean }
        Returns: undefined
      }
      update_film: {
        Args: {
          p_eligible: boolean
          p_film_id: string
          p_imdb_id: string
          p_title: string
        }
        Returns: undefined
      }
      update_film_release_date: {
        Args: { p_film_id: string; p_release_date: string }
        Returns: undefined
      }
      update_league_announcement: {
        Args: { p_body: string; p_id: string; p_title?: string }
        Returns: undefined
      }
      update_league_identity: {
        Args: { p_league_id: string; p_name: string }
        Returns: undefined
      }
      update_league_settings: {
        Args: {
          p_bids_due_dow: number
          p_bids_due_time: string
          p_bids_due_tz: string
          p_buy_in: number
          p_default_season_length?: number
          p_fake_bankroll: number
          p_league_id: string
          p_league_type?: string
          p_min_bid: number
          p_payout_structure: Json
          p_side_bets_enabled?: boolean
          p_top_n_distinct: number
        }
        Returns: undefined
      }
      update_season_settings: {
        Args: {
          p_also_set_league_default?: boolean
          p_bids_due_dow: number
          p_bids_due_time: string
          p_bids_due_tz: string
          p_buy_in: number
          p_default_season_length?: number
          p_fake_bankroll: number
          p_league_type?: string
          p_min_bid: number
          p_payout_structure: Json
          p_season_id: string
          p_side_bets_enabled?: boolean
          p_top_n_distinct: number
        }
        Returns: undefined
      }
      update_season_status: {
        Args: {
          p_season_id: string
          p_status: Database["public"]["Enums"]["season_status"]
        }
        Returns: undefined
      }
      update_week: {
        Args: {
          p_bid_deadline?: string
          p_opening_date: string
          p_week_id: string
        }
        Returns: undefined
      }
      week_of: { Args: { p_date: string }; Returns: string }
    }
    Enums: {
      film_status: "active" | "removed"
      member_role: "commissioner" | "player"
      payment_status: "paid" | "waived"
      season_status: "draft" | "active" | "completed" | "archived"
      settlement_status: "draft" | "final"
      week_status: "draft" | "open" | "locked" | "closed" | "final" | "skipped"
      weekday_start: "mon" | "tue" | "wed" | "thu"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      film_status: ["active", "removed"],
      member_role: ["commissioner", "player"],
      payment_status: ["paid", "waived"],
      season_status: ["draft", "active", "completed", "archived"],
      settlement_status: ["draft", "final"],
      week_status: ["draft", "open", "locked", "closed", "final", "skipped"],
      weekday_start: ["mon", "tue", "wed", "thu"],
    },
  },
} as const

// @migrations-sha256 d26d424699f772b0425d351e58ae6a6529a8e0e29d0e8a7dc3cd24b23b135e24
