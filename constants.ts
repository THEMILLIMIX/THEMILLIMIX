import { ServiceItem } from './types';

export const BASE_SERVICES: ServiceItem[] = [
  {
    id: 'short_mix',
    name: 'Short 믹싱 & 마스터링',
    description: '1분 미만의 숏폼(릴스, 쇼츠 등)\n커버곡 콘텐츠를 위한 최적의 엔지니어링 서비스입니다.',
    price: 20000,
    type: 'base',
    exclusiveGroup: 'main_service',
    unit: '곡',
    features: ['음/박 보정 & 기본 FX 포함', '기본 3트랙 제공']
  },
  {
    id: 'full_mix',
    name: '믹싱 & 마스터링',
    description: '3분 미만의 전체곡 ( 커버곡, 자작곡 )\n반주포함 기본 3트랙 제공',
    price: 30000,
    type: 'base',
    exclusiveGroup: 'main_service',
    unit: '곡',
    features: ['음/박 보정은 옵션으로 제공됩니다.', '1인 기준입니다, 인원 추가는 옵션으로 제공됩니다.']
  }
];

export const OPTIONS: ServiceItem[] = [
  {
    id: 'mastering_only',
    name: '마스터링',
    description: '기본으로 제공됩니다.',
    price: 0, // Included
    type: 'option',
    unit: '곡',
    features: ['INCLUDED']
  },
  {
    id: 'pitch_correction',
    name: '음정/박자 보정',
    description: '보컬의 음정과 박자를 보정하는 옵션입니다.',
    price: 10000,
    type: 'option',
    unit: '1트랙'
  },
  {
    id: 'revision',
    name: '믹싱 수정',
    description: '1회 무료 제공됩니다. 이후 수정은 유료입니다.',
    price: 10000,
    type: 'option',
    unit: '1회'
  },
  {
    id: 'add_person',
    name: '인원 추가',
    description: '믹싱 & 마스터링 인원 추가 옵션입니다.',
    price: 20000,
    type: 'option',
    unit: '1인'
  },
  {
    id: 'add_track',
    name: '1트랙 추가',
    description: '기본 제공 트랙 초과 시, 추가 트랙 비용입니다.',
    price: 10000,
    type: 'option',
    unit: '1트랙'
  },
  {
    id: 'add_minute',
    name: '1분 추가',
    description: '3분 초과시 1분 추가 옵션입니다.',
    price: 10000,
    type: 'option',
    unit: '1분'
  },
  {
    id: 'private_portfolio',
    name: '포트폴리오 미사용',
    description: '포트폴리오로 사용하지 않는 옵션입니다.',
    price: 50000,
    type: 'option',
    unit: '곡'
  },
];

export const COMMERCIAL_OPTION: ServiceItem = {
  id: 'commercial',
  name: '상업적 이용',
  description: '수익 창출용(음원 발매, 유튜브 수익 창출 등) ( Short 10배 / 그 외 5배 적용 )',
  price: 0, // Multiplier handled separately
  type: 'multiplier',
  unit: 'x5.0 ~ 10'
};