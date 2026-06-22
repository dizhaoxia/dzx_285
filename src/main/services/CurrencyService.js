const axios = require('axios');

const PREDEFINED_CURRENCIES = [
  { code: 'CNY', name: '人民币', symbol: '¥', decimal_places: 2 },
  { code: 'USD', name: '美元', symbol: '$', decimal_places: 2 },
  { code: 'EUR', name: '欧元', symbol: '€', decimal_places: 2 },
  { code: 'JPY', name: '日元', symbol: '¥', decimal_places: 0 },
  { code: 'GBP', name: '英镑', symbol: '£', decimal_places: 2 },
  { code: 'HKD', name: '港币', symbol: 'HK$', decimal_places: 2 },
  { code: 'TWD', name: '新台币', symbol: 'NT$', decimal_places: 2 },
  { code: 'AUD', name: '澳元', symbol: 'A$', decimal_places: 2 },
  { code: 'CAD', name: '加元', symbol: 'C$', decimal_places: 2 },
  { code: 'SGD', name: '新加坡元', symbol: 'S$', decimal_places: 2 },
  { code: 'KRW', name: '韩元', symbol: '₩', decimal_places: 0 },
  { code: 'THB', name: '泰铢', symbol: '฿', decimal_places: 2 }
];

class CurrencyService {
  constructor(db) {
    this.db = db;
  }

  async initCurrencies() {
    const existing = await this.db('currencies').select('code');
    const existingCodes = existing.map(c => c.code);
    const now = new Date().toISOString();

    for (const currency of PREDEFINED_CURRENCIES) {
      if (!existingCodes.includes(currency.code)) {
        await this.db('currencies').insert({
          ...currency,
          created_at: now
        });
      }
    }

    await this.ensureBaseRates();
  }

  async ensureBaseRates() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    const existingRates = await this.db('exchange_rates')
      .where('rate_date', today)
      .select('base_currency', 'target_currency');
    
    const existingPairs = existingRates.map(r => `${r.base_currency}-${r.target_currency}`);
    
    const basePairs = [
      { base: 'CNY', target: 'USD', rate: 0.1389 },
      { base: 'USD', target: 'CNY', rate: 7.20 },
      { base: 'CNY', target: 'EUR', rate: 0.1278 },
      { base: 'EUR', target: 'CNY', rate: 7.82 },
      { base: 'CNY', target: 'JPY', rate: 20.5 },
      { base: 'JPY', target: 'CNY', rate: 0.0488 },
      { base: 'USD', target: 'EUR', rate: 0.92 },
      { base: 'EUR', target: 'USD', rate: 1.087 },
      { base: 'USD', target: 'JPY', rate: 147.5 },
      { base: 'JPY', target: 'USD', rate: 0.00678 }
    ];

    for (const pair of basePairs) {
      const pairKey = `${pair.base}-${pair.target}`;
      if (!existingPairs.includes(pairKey)) {
        await this.db('exchange_rates').insert({
          base_currency: pair.base,
          target_currency: pair.target,
          rate: pair.rate,
          source: 'default',
          rate_date: today,
          created_at: now.toISOString()
        });
      }
    }
  }

  async getActiveCurrencies() {
    return this.db('currencies')
      .where('is_active', true)
      .orderBy('code', 'asc');
  }

  async getAllCurrencies() {
    return this.db('currencies').orderBy('code', 'asc');
  }

  async getLatestRate(baseCurrency, targetCurrency) {
    if (baseCurrency === targetCurrency) {
      return 1;
    }

    const rate = await this.db('exchange_rates')
      .where({ base_currency: baseCurrency, target_currency: targetCurrency })
      .orderBy('rate_date', 'desc')
      .orderBy('created_at', 'desc')
      .first();

    if (rate) {
      return parseFloat(rate.rate);
    }

    const reverseRate = await this.db('exchange_rates')
      .where({ base_currency: targetCurrency, target_currency: baseCurrency })
      .orderBy('rate_date', 'desc')
      .orderBy('created_at', 'desc')
      .first();

    if (reverseRate) {
      return 1 / parseFloat(reverseRate.rate);
    }

    const cnyToBase = await this.getLatestRate('CNY', baseCurrency);
    const cnyToTarget = await this.getLatestRate('CNY', targetCurrency);
    
    if (cnyToBase && cnyToTarget) {
      return cnyToTarget / cnyToBase;
    }

    return null;
  }

  async convertAmount(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    const rate = await this.getLatestRate(fromCurrency, toCurrency);
    if (rate === null) {
      throw new Error(`无法获取 ${fromCurrency} 到 ${toCurrency} 的汇率`);
    }

    return amount * rate;
  }

  async fetchRatesFromAPI(baseCurrency = 'CNY') {
    try {
      const response = await axios.get(
        `https://api.exchangerate-api.com/v4/latest/${baseCurrency}`,
        { timeout: 10000 }
      );

      const rates = response.data.rates;
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();

      for (const [targetCurrency, rate] of Object.entries(rates)) {
        if (targetCurrency !== baseCurrency) {
          const existing = await this.db('exchange_rates')
            .where({
              base_currency: baseCurrency,
              target_currency: targetCurrency,
              rate_date: today
            })
            .first();

          if (existing) {
            await this.db('exchange_rates')
              .where({ id: existing.id })
              .update({
                rate: rate,
                source: 'api',
                created_at: now
              });
          } else {
            await this.db('exchange_rates').insert({
              base_currency: baseCurrency,
              target_currency: targetCurrency,
              rate: rate,
              source: 'api',
              rate_date: today,
              created_at: now
            });
          }
        }
      }

      return { success: true, updated: Object.keys(rates).length - 1 };
    } catch (error) {
      console.error('从API获取汇率失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  async setManualRate(baseCurrency, targetCurrency, rate, date = null) {
    const rateDate = date || new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const existing = await this.db('exchange_rates')
      .where({
        base_currency: baseCurrency,
        target_currency: targetCurrency,
        rate_date: rateDate
      })
      .first();

    if (existing) {
      await this.db('exchange_rates')
        .where({ id: existing.id })
        .update({
          rate: rate,
          source: 'manual',
          created_at: now
        });
    } else {
      await this.db('exchange_rates').insert({
        base_currency: baseCurrency,
        target_currency: targetCurrency,
        rate: rate,
        source: 'manual',
        rate_date: rateDate,
        created_at: now
      });
    }

    return true;
  }

  async getRateHistory(baseCurrency, targetCurrency, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return this.db('exchange_rates')
      .where({ base_currency: baseCurrency, target_currency: targetCurrency })
      .where('rate_date', '>=', startDate.toISOString().split('T')[0])
      .orderBy('rate_date', 'desc');
  }

  formatCurrency(amount, currencyCode) {
    const currency = PREDEFINED_CURRENCIES.find(c => c.code === currencyCode);
    const symbol = currency?.symbol || currencyCode;
    const decimals = currency?.decimal_places || 2;
    
    return `${symbol}${amount.toFixed(decimals)}`;
  }
}

module.exports = CurrencyService;
module.exports.PREDEFINED_CURRENCIES = PREDEFINED_CURRENCIES;
