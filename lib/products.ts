// 씨앗 상품. 구매 화면 표시와 주문 금액 계산(6-2)이 모두 이 목록을 쓴다.
// 금액은 서버가 이 목록으로 다시 정하므로, 브라우저가 보낸 금액은 믿지 않는다.
export type Product = {
  id: string;
  name: string;
  seeds: number;
  price: number;
};

export const PRODUCTS: Product[] = [
  { id: 'seed-1', name: '한 개', seeds: 1, price: 990 },
  { id: 'seed-5', name: '한 줌', seeds: 5, price: 4900 },
  { id: 'seed-11', name: '한 봉지', seeds: 11, price: 9900 },
  { id: 'seed-24', name: '한 자루', seeds: 24, price: 19900 },
];

export function findProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}