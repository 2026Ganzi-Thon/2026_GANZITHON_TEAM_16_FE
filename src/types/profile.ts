export interface Profile {
  id?: string;
  nickname: string;
  email: string | null;
  birthDate: string | null;
  profileImageUrl?: string | null;
  createdAt?: string;
  usePastDiaries: boolean;
  eveningReminderEnabled: boolean;
}
