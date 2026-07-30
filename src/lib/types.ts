export type UUID = string;

export type Player = {
  id: UUID;
  user_id: UUID | null;
  full_name: string;
  nickname: string | null;
  batting_style: string | null;
  bowling_style: string | null;
  role: string | null;
  photo_url: string | null;
  created_by: UUID | null;
  created_at: string;
};

export type Team = {
  id: UUID;
  name: string;
  short_name: string;
  logo_url: string | null;
  home_ground: string | null;
  captain_player_id: UUID | null;
  vice_captain_player_id: UUID | null;
  description: string | null;
  city: string | null;
  country: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  founded_year: number | null;
  is_active: boolean;
  created_by: UUID | null;
  created_at: string;
};

export type TeamMember = {
  team_id: UUID;
  player_id: UUID;
  jersey_number: number | null;
};

export type MatchStatus = "scheduled" | "live" | "completed" | "abandoned";

export type Match = {
  id: UUID;
  title: string | null;
  venue: string | null;
  match_date: string;
  overs_per_innings: number;
  team_a_id: UUID;
  team_b_id: UUID;
  toss_winner_team_id: UUID | null;
  toss_decision: "bat" | "bowl" | null;
  status: MatchStatus;
  state: MatchState;
  match_type: string | null;
  start_time: string | null;
  format: string | null;
  ball_type: string | null;
  innings_count: number;
  series_id: UUID | null;
  tournament_id: UUID | null;
  stage: string | null;
  group_name: string | null;
  review_note: string | null;
  result_text: string | null;
  submitted_by: UUID | null;
  submitted_at: string | null;
  verified_by: UUID | null;
  verified_at: string | null;
  admin_verified_by: UUID | null;
  admin_verified_at: string | null;
  requires_admin_verification: boolean;
  stats_official: boolean;
  created_by: UUID | null;
  created_at: string;
};

export type Innings = {
  id: UUID;
  match_id: UUID;
  innings_number: number;
  batting_team_id: UUID;
  bowling_team_id: UUID;
  is_closed: boolean;
  created_at: string;
};

export type ExtraType = "wide" | "noball" | "bye" | "legbye" | "penalty";
export type WicketType =
  | "bowled"
  | "caught"
  | "lbw"
  | "run out"
  | "stumped"
  | "hit wicket"
  | "retired"
  | "retired out"
  | "obstructing the field";

export const WICKET_TYPES: WicketType[] = [
  "bowled",
  "caught",
  "lbw",
  "run out",
  "stumped",
  "hit wicket",
  "retired",
  "retired out",
  "obstructing the field",
];

/** The single source of truth for every statistic in WicketWise. */
export type Delivery = {
  id: UUID;
  innings_id: UUID;
  over_number: number;
  ball_number: number;
  striker_id: UUID | null;
  non_striker_id: UUID | null;
  bowler_id: UUID | null;
  runs_off_bat: number;
  extra_type: ExtraType | null;
  extra_runs: number;
  wicket_type: WicketType | null;
  dismissed_player_id: UUID | null;
  fielder_id: UUID | null;
  fielder2_id: UUID | null;
  scored_by: UUID | null;
  created_at: string;
};

export type AchievementCode =
  | "half_century"
  | "century"
  | "five_wicket_haul"
  | "man_of_the_match"
  | "tournament_winner"
  | "1000_runs"
  | "50_wickets"
  | "25_catches"
  | "captain";

export type Achievement = {
  code: AchievementCode;
  label: string;
  description: string;
  earned: boolean;
  progress: number;
  target: number;
};

/* ------------------------------------------------------- roles & profiles */
export type AppRole = "admin" | "captain" | "scorer" | "player";

export type PlayerStatus =
  | "registered"
  | "available"
  | "unavailable"
  | "selected"
  | "playing"
  | "suspended";

export type RequestStatus = "pending" | "approved" | "rejected";

export type Profile = {
  id: UUID;
  full_name: string;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  nationality: string | null;
  city: string | null;
  batting_style: string | null;
  bowling_style: string | null;
  primary_role: string | null;
  secondary_role: string | null;
  jersey_number: number | null;
  preferred_position: string | null;
  experience: string | null;
  bio: string | null;
  is_available: boolean;
  status: PlayerStatus;
  onboarding_step: number;
  onboarding_complete: boolean;
  created_at: string;
};

export type UserRole = { id: UUID; user_id: UUID; role: AppRole };

export type CaptainRequest = {
  id: UUID;
  user_id: UUID;
  message: string | null;
  status: RequestStatus;
  reviewed_by: UUID | null;
  reviewed_at: string | null;
  created_at: string;
};

export type ScoringPermission = {
  id: UUID;
  match_id: UUID;
  user_id: UUID;
  granted_by: UUID | null;
  revoked: boolean;
  created_at: string;
};

/* ------------------------------------------ teams, selection & competitions */
export type InviteStatus = "pending" | "accepted" | "declined" | "cancelled";

export type TeamInvitation = {
  id: UUID;
  team_id: UUID;
  player_id: UUID;
  invited_by: UUID | null;
  status: InviteStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
};

export type MatchState =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "SQUAD_SELECTION"
  | "READY"
  | "TOSS"
  | "LIVE"
  | "COMPLETED"
  | "VERIFIED"
  | "ARCHIVED";

/** The only legal forward transitions. The database enforces the same list. */
export const MATCH_FLOW: MatchState[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "SQUAD_SELECTION",
  "READY",
  "TOSS",
  "LIVE",
  "COMPLETED",
  "VERIFIED",
  "ARCHIVED",
];

export const nextMatchState = (s: MatchState): MatchState | null =>
  MATCH_FLOW[MATCH_FLOW.indexOf(s) + 1] ?? null;

export type ApprovalStatus = "draft" | "submitted" | "approved" | "rejected" | "changes_requested";
export type TournamentFormat = "league" | "knockout" | "group_knockout";

export type Series = {
  id: UUID;
  name: string;
  description: string | null;
  team_a_id: UUID | null;
  team_b_id: UUID | null;
  match_count: number;
  start_date: string | null;
  end_date: string | null;
  points_per_win: number;
  points_per_tie: number;
  approval_status: ApprovalStatus;
  review_note: string | null;
  reviewed_by: UUID | null;
  created_by: UUID | null;
  created_at: string;
};

export type Tournament = {
  id: UUID;
  name: string;
  logo_url: string | null;
  description: string | null;
  organizer: string | null;
  start_date: string | null;
  end_date: string | null;
  venue: string | null;
  format: TournamentFormat;
  team_count: number;
  rules: string | null;
  points_per_win: number;
  points_per_tie: number;
  points_per_loss: number;
  approval_status: ApprovalStatus;
  review_note: string | null;
  reviewed_by: UUID | null;
  created_by: UUID | null;
  created_at: string;
};

export type TournamentTeam = { tournament_id: UUID; team_id: UUID; group_name: string | null };

export type TeamStats = {
  team_id: UUID;
  name: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  no_result: number;
  runs_for: number;
  highest_score: number;
  lowest_score: number;
  balls_faced: number;
  balls_bowled: number;
  win_pct: number;
};

export type MatchResult = {
  match_id: UUID;
  series_id: UUID | null;
  tournament_id: UUID | null;
  state: MatchState;
  team_a_id: UUID;
  team_b_id: UUID;
  team_a_runs: number;
  team_b_runs: number;
  winner_team_id: UUID | null;
  outcome: "pending" | "decided" | "tie" | "no_result";
};

export type SeriesStanding = {
  series_id: UUID;
  team_id: UUID;
  played: number;
  won: number;
  lost: number;
  tied: number;
  no_result: number;
  points: number;
  runs_for: number;
  run_rate: number;
};

export type PointsRow = {
  tournament_id: UUID;
  team_id: UUID;
  group_name: string | null;
  played: number;
  won: number;
  lost: number;
  tied: number;
  no_result: number;
  points: number;
  runs_for: number;
  runs_against: number;
  nrr: number;
};

/* ---------------------------------------- integrity, audit & notifications */
export type Notification = {
  id: UUID;
  user_id: UUID;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

export type CorrectionRequest = {
  id: UUID;
  match_id: UUID;
  delivery_id: UUID | null;
  requested_by: UUID;
  field: string | null;
  current_value: string | null;
  requested_value: string | null;
  reason: string;
  proposed: Record<string, unknown> | null;
  status: RequestStatus;
  reviewed_by: UUID | null;
  reviewed_at: string | null;
  review_note: string | null;
  applied_at: string | null;
  created_at: string;
};

export type AuditLog = {
  id: UUID;
  actor_id: UUID | null;
  action: string;
  entity_table: string;
  entity_id: UUID | null;
  match_id: UUID | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
};

/** Fields of a delivery a correction request may target. */
export const CORRECTABLE_FIELDS = [
  "runs_off_bat",
  "extra_runs",
  "extra_type",
  "wicket_type",
  "striker_id",
  "non_striker_id",
  "bowler_id",
  "dismissed_player_id",
  "fielder_id",
] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];
