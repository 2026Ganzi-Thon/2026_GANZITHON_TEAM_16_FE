// Local stand-in until the character list/ownership API exists.
// The real API needs the server's character UUID, never an image name or card index.
export interface ChatCharacter {
  id: string;
  name: string;
  image: string;
}

export const defaultCharacter: ChatCharacter = {
  id: 'local-mowoo-kind',
  name: '다정한 모우',
  image: '/assets/ade05.png',
};

export const characters: Record<string, ChatCharacter> = { [defaultCharacter.id]: defaultCharacter };

export const characterName = (id: string | null) => (id && characters[id]?.name) || defaultCharacter.name;
