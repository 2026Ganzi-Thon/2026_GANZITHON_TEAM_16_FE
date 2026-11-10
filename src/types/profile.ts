export interface Profile {
  id?: string;
  nickname: string;
  email: string | null;
  birthDate: string | null;
  profileImageUrl?: string | null;
  usePastDiaries: boolean;
  eveningReminderEnabled: boolean;
}
