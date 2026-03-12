export enum CoffeeMarket {
  DAK_LAK = 'DAK_LAK',
  LAM_DONG = 'LAM_DONG',
  GIA_LAI = 'GIA_LAI',
  DAK_NONG = 'DAK_NONG',
  KON_TUM = 'KON_TUM',
  HO_TIEU = 'HO_TIEU', // pepper
  USD_VND = 'USD_VND', // exchange rate
}

// Vietnamese display labels
export const CoffeeMarketLabel: Record<CoffeeMarket, string> = {
  [CoffeeMarket.DAK_LAK]: 'Đắk Lắk',
  [CoffeeMarket.LAM_DONG]: 'Lâm Đồng',
  [CoffeeMarket.GIA_LAI]: 'Gia Lai',
  [CoffeeMarket.DAK_NONG]: 'Đắk Nông',
  [CoffeeMarket.KON_TUM]: 'Kon Tum',
  [CoffeeMarket.HO_TIEU]: 'Hồ tiêu',
  [CoffeeMarket.USD_VND]: 'Tỷ giá USD/VND',
};
