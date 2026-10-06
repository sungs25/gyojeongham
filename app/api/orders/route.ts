import { findProduct } from '@/lib/products';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// 씨앗 구매 주문을 만든다. 금액은 브라우저가 보낸 값이 아니라 상품 목록에서 정한다.
export async function POST(request: Request) {
  // 1. 누가 요청했는지 확인
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) {
    return Response.json({ error: '로그인이 필요합니다.', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  // 2. 상품 확인
  const body = await request.json().catch(() => null);
  const product = typeof body?.productId === 'string' ? findProduct(body.productId) : undefined;
  if (!product) {
    return Response.json({ error: '없는 상품입니다.', code: 'BAD_PRODUCT' }, { status: 400 });
  }

  // 3. 주문을 만든다
  const admin = createAdminClient();
  const { data: orderId, error } = await admin.rpc('create_order', {
    p_user: userId,
    p_product: product.id,
    p_seeds: product.seeds,
    p_amount: product.price,
  });

  if (error || typeof orderId !== 'string') {
    console.error('create_order 실패', error);
    return Response.json({ error: '주문을 만들지 못했습니다.', code: 'SERVER' }, { status: 500 });
  }

  return Response.json({
    orderId,
    amount: product.price,
    orderName: `교정햄 씨앗 ${product.name} (${product.seeds}개)`,
  });
}