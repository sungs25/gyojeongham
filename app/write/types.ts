// 모델이 주는 변경 한 건. 위치 정보가 없다.
export type RawChange = {
  before: string;
  after: string;
  rule_id: string;
  note: string;
};

// 원문에서의 위치가 확정된 변경.
export type Change = {
  id: string;
  start: number;  // 원문 절대 오프셋
  end: number;
  before: string;
  after: string;
  ruleId: string;
  note: string;
  applied: boolean;
};

// 원문의 문단 하나. 오프셋은 원문 절대값(앞뒤 공백 제외).
export type Para = {
  start: number;
  end: number;
  text: string;
};

// 모델에 보내는 단위. text는 문단들을 \n\n으로 다시 이은 것이라
// 원문과 다를 수 있다. 오프셋은 paras가 들고 있다.
export type Chunk = {
  index: number;
  paras: Para[];
  text: string;
};