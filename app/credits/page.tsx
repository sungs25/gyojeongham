import { PaymentWidget } from './PaymentWidget';

// 씨앗 구매 화면. 6-1에서는 결제위젯이 뜨는지만 확인한다.
export default function CreditsPage() {
  return (
    <main className="editor">
      <h1>씨앗 사기</h1>
      <PaymentWidget amount={990} />
    </main>
  );
}