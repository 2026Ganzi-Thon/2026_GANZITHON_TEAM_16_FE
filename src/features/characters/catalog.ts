// Local character catalog for the My 캐릭터 screens until the character list /
// ownership API exists. Descriptions are drafts until the team's character setting is written.
export interface CharacterInfo {
  key: string;
  name: string;
  image: string;
  /** Name color, taken from the card label in the design. */
  color: string;
  /** Bottom color of the detail modal's white-to-color gradient. */
  tint: string;
  owned: boolean;
  description: string;
}

export const characterCatalog: CharacterInfo[] = [
  {
    key: 'kind', name: '다정한 모우', image: '/assets/35960.png', color: '#1e838a', tint: '#dcfff1', owned: true,
    description: '언제나 먼저 귀 기울여 주는 모우예요. 오늘 있었던 일을 천천히 들어 주고, 서툰 마음도 괜찮다고 따뜻하게 다독여 줘요. 말로 꺼내기 어려운 감정도 재촉하지 않고 기다려 주니, 하루를 마무리할 때 편하게 이야기를 시작해 보세요. 대화가 끝나면 오늘의 마음을 다정한 일기로 정리해 줄 거예요.',
  },
  {
    key: 'cool', name: '냉철한 모우', image: '/assets/a4467.png', color: '#174d83', tint: '#dfeaff',
    owned: true,
    description: '감정에 휩쓸리지 않고 상황을 차분하게 정리해 주는 모우예요. 무엇이 걱정인지, 지금 할 수 있는 일은 무엇인지 하나씩 나눠서 함께 살펴봐요. 막연한 불안을 구체적인 생각으로 바꾸고 싶을 때 잘 맞아요. 대화가 끝나면 오늘의 고민과 정리한 생각을 깔끔한 일기로 남겨 줄 거예요.',
  },
  {
    key: 'cheerful', name: '유쾌한 모우', image: '/assets/4612e.png', color: '#ad5446', tint: '#fff1dc', owned: true,
    description: '무거운 하루도 가볍게 웃어넘길 수 있게 도와주는 모우예요. 지나치기 쉬운 작은 즐거움을 찾아 주고 기분 좋은 에너지를 나눠 줘요. 기분 전환이 필요하거나 오늘 있었던 재미있는 일을 자랑하고 싶을 때 불러 주세요. 대화가 끝나면 웃음이 남는 밝은 일기로 정리해 줄 거예요.',
  },
  {
    key: 'queen', name: '퀸 마인드 모우', image: '/assets/72446.png', color: '#bf3896', tint: '#ffe4f4', owned: false,
    description: '나를 가장 소중하게 대하는 법을 알려 주는 프리미엄 모우예요. 남의 기준보다 내 마음을 먼저 챙기도록, 스스로를 아끼는 말과 태도를 함께 연습해요. 자존감이 흔들리는 날 곁에 두면 좋아요. 대화가 끝나면 나를 다시 세워 주는 일기로 정리해 줄 거예요.',
  },
  {
    key: 'confident', name: '당당한 모우', image: '/assets/e6937.png', color: '#261b6c', tint: '#e8e3ff', owned: false,
    description: '흔들리는 순간에도 나를 믿게 해 주는 프리미엄 모우예요. 지금까지 잘해 온 것들을 함께 떠올리며 자신감을 채워 줘요. 발표나 면접처럼 중요한 일을 앞두고 긴장될 때 힘이 되어 줄 거예요. 대화가 끝나면 다음 걸음을 응원하는 일기로 정리해 줄 거예요.',
  },
];

export const findCharacter = (key: string | null) => characterCatalog.find(c => c.key === key) ?? characterCatalog[0];

/** Characters screen: the group node holding each card's background, image and name. */
export const characterCardNodes: Record<string, string> = {
  kind: '120:177', cool: '120:178', cheerful: '120:183', queen: '120:201', confident: '120:209',
};
