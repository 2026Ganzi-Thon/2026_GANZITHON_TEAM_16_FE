// Which character a chat uses. The logged-out preview uses a local stand-in; logged in,
// the server's owned character UUID is required (never an image name or card index).
import { characterApi } from '../characters/api';
import { characterCatalog } from '../characters/catalog';

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

const selectionKey = 'mowoo.selectedCharacter'; // written by the My 캐릭터 screen

/**
 * Server UUID for a new chat: the character picked on My 캐릭터 if it is still owned,
 * otherwise the first owned character. Also remembers names for the chat header.
 */
export async function resolveLiveCharacterId(): Promise<string> {
  const { items } = await characterApi.list();
  items.forEach(item => {
    characters[item.id] = { id: item.id, name: item.name, image: characterCatalog.find(c => c.key === item.code.toLowerCase())?.image ?? defaultCharacter.image };
  });
  let selected: string | null = null;
  try { selected = (JSON.parse(sessionStorage.getItem(selectionKey) ?? 'null') as { id?: string } | null)?.id ?? null; } catch { /* no selection */ }
  const owned = items.filter(item => item.isOwned);
  const choice = owned.find(item => item.id === selected) ?? owned[0];
  if (!choice) throw new Error('보유한 캐릭터가 없어서 대화를 시작할 수 없어요.');
  return choice.id;
}
