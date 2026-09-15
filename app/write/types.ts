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

export type Chunk = {
  index: number;
  start: number;  // 원문 절대 오프셋 (포함)
  end: number;    // 원문 절대 오프셋 (미포함)
  text: string;
};