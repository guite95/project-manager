import snapshot from './tns-schema.json' with { type: 'json' };
import type { FlowChart } from '../../components/flow/types';

export const tnsSchema = snapshot;
export type ErdModel = (typeof snapshot.models)[number];
export type ErdField = ErdModel['fields'][number];
export const erdDomains = [
  { slug: 'organization', title: '조직·사용자', pattern: /^(account|session|user|verification|groups|companies|business_units|departments|employees)$/ },
  { slug: 'partners', title: '거래처·브랜드', pattern: /^(business_partner|customer_profile|customer_grade|supplier_profile|brand)/ },
  { slug: 'sales', title: '영업·계약·현장', pattern: /^(quote|contract|customer_project|special_price|sales_channels|sites$)/ },
  { slug: 'trade', title: '구매·무역', pattern: /^(purchase_(intake|order)|import_(project|document|packing|shipment|milestone)|customs|scheduler)/ },
  { slug: 'inventory', title: '재고·입출고·전시장', pattern: /^(inventory|stock_|warehouse|wms_|shipment|purchase_receipt|showroom)/ },
  { slug: 'finance', title: '회계·수금·정산', pattern: /^(accounts$|account_external|bank_|journal|landed_|payment_|expenditure_|posting_|tax_|collections$|card_|trade_payment|import_settlement|logistics_expenditure|exchange_rates$)/ },
  { slug: 'catalog', title: '품목·가격 정책', pattern: /^(item|finish|size_|fx_|pack_|pricing_|channel_|supplier_(price|list)|price_scope|purchase_prices$|sales_prices$)/ },
  { slug: 'pricelist', title: '가격표 적재', pattern: /^(price_import|pricelist_)/ },
  { slug: 'orchestration', title: '가격표 오케스트레이션', pattern: /^price_orch/ },
  { slug: 'system', title: '결재·문서·외부 연동', pattern: /./ },
];

export function domainOf(name: string) {
  return erdDomains.find(domain => domain.pattern.test(name))!;
}

export function fieldKeys(model: ErdModel, field: ErdField): string[] {
  return [
    ...(model.primaryKey.includes(field.name) ? ['PK'] : []),
    ...(snapshot.relations.some(r => r.source === model.name && r.fields.includes(field.name)) ? ['FK'] : []),
    ...(model.uniqueKeys.some(key => key.length === 1 && key[0] === field.name) ? ['UQ'] : []),
  ];
}

/** Domain view includes outgoing FK targets once; focus shows both inbound and outbound relations. */
export function makeErdChart(domain: string, focus?: string): FlowChart {
  const owned = snapshot.models.filter(m => domainOf(m.name).slug === domain);
  const roots = new Set(focus ? [focus] : owned.map(m => m.name));
  const relations = snapshot.relations.filter(r => roots.has(r.source) || (Boolean(focus) && roots.has(r.target)));
  const visible = new Set([...roots, ...relations.flatMap(r => [r.source, r.target])]);
  const title = erdDomains.find(d => d.slug === domain)!.title;
  return {
    slug: `erd-${domain}${focus ? `-${focus}` : ''}`,
    title: focus ? `${focus} 연결 관계` : `${title} ERD`,
    description: `${owned.length}개 테이블과 참조 관계 · ${snapshot.capturedOn} 로컬 Prisma 스키마 기준`,
    caption: `${visible.size}개 테이블 · ${relations.length}개 FK 관계`,
    erdDomain: domain,
    direction: 'LR',
    nodeWidth: 360,
    nodes: snapshot.models.filter(m => visible.has(m.name)).map(model => ({
      id: model.name,
      data: {
        kind: 'store',
        label: model.table,
        entity: {
          domain: domainOf(model.name).title,
          external: !roots.has(model.name),
          fieldCount: model.fields.length,
          fields: model.fields.filter(field => fieldKeys(model, field).some(key => key === 'PK' || key === 'FK')).map(field => ({
            name: field.column, type: field.type, optional: field.optional, keys: fieldKeys(model, field),
          })),
        },
      },
    })),
    edges: relations.map(r => ({
      id: r.id, source: r.source, target: r.target,
      kind: r.optional ? 'ref' : 'impl',
      tone: 'store',
      label: `${r.unique ? '0..1' : '0..N'} : ${r.optional ? '0..1' : '1'}`,
    })),
    howToRead: [
      '각 상자는 실제 테이블이며 PK는 기본 키, FK는 외래 키, UQ는 단일 컬럼 고유 제약입니다. 기본 화면에는 PK·FK만 표시합니다. 테이블을 선택하면 전체 컬럼과 복합 키를 확인할 수 있습니다.',
      '화살표는 FK를 가진 테이블에서 참조 대상 테이블로 향합니다. 왼쪽 숫자는 참조 대상 한 건에 연결될 수 있는 행 수이고, 오른쪽은 각 행이 참조하는 대상 수입니다. 점선은 선택 관계입니다.',
      '참조 배지가 있는 테이블은 다른 영역의 연결 대상입니다. 영역 화면은 해당 영역에서 나가는 모든 FK를 포함합니다. 테이블 선택 시 들어오는 FK도 함께 표시합니다.',
      'Prisma에 선언된 관계만 표시합니다. ID 문자열·JSON 안의 논리적 연결과 DB 전용 인덱스·제약은 포함하지 않습니다. 운영 DB와의 일치 여부는 확인하지 않은 로컬 스키마 스냅샷입니다.',
    ],
  };
}

export const tnsErdCharts = erdDomains.map(domain => makeErdChart(domain.slug));
