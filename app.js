(function () {
  'use strict';

  // ===== 定数 =====
  var API_BASE = 'https://api.scryfall.com/cards/search';
  var QUERY_FILTERS = '+-s%3Alea+-s%3Aleb+-s%3Aunk+-t%3Abasic+-is%3Atoken+-t%3Aemblem' +
    '+-s%3A30a+-s%3Aced+-s%3Acei+-s%3Aptc' +
    '+-s%3Asld+-s%3Aslp+-s%3Aslc+-s%3Aslu+-s%3Apssc' +
    '+-border%3Agold';
  var SET_FILTERS = '+-s%3Alea+-s%3Aleb+-s%3Aunk' +
    '+-s%3A30a+-s%3Aced+-s%3Acei+-s%3Aptc' +
    '+-s%3Asld+-s%3Aslp+-s%3Aslc+-s%3Aslu+-s%3Apssc' +
    '+-border%3Agold';
  var QUERY_SUFFIX = '&order=usd&dir=desc&unique=prints';

  var FORMATS = {
    y1993_2003: 'date%3E%3D1995-01-01+date%3C%3D2003-12-31',
    y2004_2014: 'date%3E%3D2004-01-01+date%3C%3D2014-12-31',
    y2015_2020: 'date%3E%3D2015-01-01+date%3C%3D2020-12-31',
    y2021_2022: 'date%3E%3D2021-01-01+date%3C%3D2022-12-31',
    y2023_2025: 'date%3E%3D2023-01-01+date%3C%3D2025-12-31',
    y2026_:     'date%3E%3D2026-01-01'
  };

  var BASIC_LAND_URL = API_BASE + '?q=t%3Abasic' + SET_FILTERS + QUERY_SUFFIX;
  var TOKEN_URL      = API_BASE + '?q=%28is%3Atoken+OR+t%3Aemblem%29' + SET_FILTERS + QUERY_SUFFIX;
  // Scryfall API は foil 価格でのソート/フィルタ不可。全ページ走査してクライアント側で判定する
  var FOIL_URL       = API_BASE + '?q=is%3Afoil+%28r%3Acommon+OR+r%3Auncommon%29' + QUERY_FILTERS + '&order=usd&dir=desc&unique=prints';

  var RATE_LIMIT_DELAY   = 100; // ms
  var MIN_PRICE_COMMON   = 0.80;
  var MIN_PRICE_UNCOMMON = 2.50;
  var MIN_PRICE_SPECIAL  = 2.50;
  var MIN_PRICE_FOIL     = 10.00;

  var EXCLUDED_SETS = [
    'Foreign Black Border',
    'Summer Magic / Edgar',
    'Beatdown Box Set',
    'Battle Royale Box Set',
    'Media and Collaboration Promos',
    'Unglued',
    'Renaissance',
    'Introductory Two-Player Set',
    'MicroProse Promos',
    'Fourth Edition Foreign Black Border',
    'Unlimited Edition',
    'Rinascimento',
    'Salvat 2005',
    'Salvat 2011',
    'Planechase Planes',
    'Planechase',
    'Archenemy Schemes',
    'Archenemy',
    'DCI Promos',
    'New Phyrexia Promos',
    'Planechase 2012 Planes',
    'Planechase 2012',
    'Face the Hydra',
    'Battle the Horde',
    'M15 Prerelease Challenge',
    'Planechase Anthology Planes',
    'Planechase Anthology',
    'Commander Anthology Tokens',
    'Commander Anthology Volume II Tokens',
    'Commander Anthology Volume II',
    'Core Set 2020 Promos',
    'The List',
    'Adventures in the Forgotten Realms Tokens',
    'Mystery Booster 2'
  ];
  var EXCLUDED_PREFIXES = ['Duel Decks:', 'Duel Decks Anthology:', 'Archenemy:'];

  function buildUrl(format, rarity) {
    return API_BASE + '?q=r%3A' + rarity + QUERY_FILTERS + '+' + FORMATS[format] + QUERY_SUFFIX;
  }

  // ===== 状態 =====
  var currentFetchId = 0;
  var setSections = {};
  var exchangeRates = { JPY: null, EUR: null };
  var ratesFetched = false;

  // ===== DOM要素 =====
  var cardGrid           = document.getElementById('card-grid');
  var setNav             = document.getElementById('set-nav');
  var loadingEl          = document.getElementById('loading');
  var backToTopBtn       = document.getElementById('back-to-top');
  var errorEl            = document.getElementById('error-message');
  var endMessageEl       = document.getElementById('end-message');
  var commonThresholdEl        = document.getElementById('common-threshold');
  var uncommonThresholdEl      = document.getElementById('uncommon-threshold');
  var basicLandThresholdEl      = document.getElementById('basic-land-threshold');
  var tokenThresholdEl          = document.getElementById('token-threshold');
  var commonThresholdLabelEl    = document.getElementById('common-threshold-label');
  var uncommonThresholdLabelEl  = document.getElementById('uncommon-threshold-label');
  var basicLandThresholdLabelEl = document.getElementById('basic-land-threshold-label');
  var tokenThresholdLabelEl     = document.getElementById('token-threshold-label');
  var currencySelectEl         = document.getElementById('currency-select');
  var cardLinkSelectEl         = document.getElementById('card-link-select');

  function getCommonThreshold()    { return parseFloat(commonThresholdEl.value); }
  function getUncommonThreshold()  { return parseFloat(uncommonThresholdEl.value); }
  function getBasicLandThreshold() { return parseFloat(basicLandThresholdEl.value); }
  function getTokenThreshold()     { return parseFloat(tokenThresholdEl.value); }

  function updateThresholdVisibility(format) {
    var isBasicLand = format === 'basic_land';
    var isToken     = format === 'token';
    var showCommonUncommon = !isBasicLand && !isToken;
    commonThresholdLabelEl.classList.toggle('hidden', !showCommonUncommon);
    uncommonThresholdLabelEl.classList.toggle('hidden', !showCommonUncommon);
    basicLandThresholdLabelEl.classList.toggle('hidden', !isBasicLand);
    tokenThresholdLabelEl.classList.toggle('hidden', !isToken);
  }
  function getCurrency()          { return currencySelectEl.value; }

  function getCardLinkUrl(name) {
    var encoded = encodeURIComponent(name);
    var store = cardLinkSelectEl.value;
    if (store === 'cardkingdom') {
      return 'https://www.cardkingdom.com/catalog/search?filter%5Bname%5D=' + encoded;
    }
    if (store === 'tcgplayer') {
      return 'https://www.tcgplayer.com/search/magic/product?q=' + encoded + '&productLineName=magic';
    }
    return 'https://www.hareruyamtg.com/ja/products/search?product=' + encoded;
  }

  // ===== ユーティリティ =====

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function getImageUrl(card) {
    if (card.image_uris && card.image_uris.normal) return card.image_uris.normal;
    if (card.card_faces && card.card_faces.length > 0) {
      var face = card.card_faces[0];
      if (face.image_uris && face.image_uris.normal) return face.image_uris.normal;
    }
    return null;
  }

  function fetchExchangeRates(callback) {
    if (ratesFetched) { if (callback) callback(); return; }
    fetch('https://api.frankfurter.app/latest?from=USD&to=JPY,EUR')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.rates) {
          exchangeRates.JPY = data.rates.JPY || null;
          exchangeRates.EUR = data.rates.EUR || null;
        }
        ratesFetched = true;
        if (callback) callback();
      })
      .catch(function () {
        ratesFetched = true;
        if (callback) callback();
      });
  }

  function convertFromUSD(usdAmount, currency) {
    if (currency === 'JPY' && exchangeRates.JPY) {
      return '¥' + Math.round(usdAmount * exchangeRates.JPY).toLocaleString('ja-JP');
    }
    if (currency === 'EUR' && exchangeRates.EUR) {
      return '€' + (usdAmount * exchangeRates.EUR).toFixed(2);
    }
    return '$' + usdAmount.toFixed(2);
  }

  function formatPrice(prices) {
    if (!prices) return null;
    var currency = getCurrency();
    if (prices._rawFoilUsd !== undefined) {
      return convertFromUSD(prices._rawFoilUsd, currency);
    }
    if (prices._rawFoilEur !== undefined) {
      var eurVal = prices._rawFoilEur;
      if (currency === 'JPY' && exchangeRates.EUR && exchangeRates.JPY) {
        return '¥' + Math.round((eurVal / exchangeRates.EUR) * exchangeRates.JPY).toLocaleString('ja-JP');
      }
      if (currency === 'USD' && exchangeRates.EUR) {
        return '$' + (eurVal / exchangeRates.EUR).toFixed(2);
      }
      return '€' + eurVal.toFixed(2);
    }
    if (!prices.usd) return null;
    return convertFromUSD(parseFloat(prices.usd), currency);
  }

  function createSetSymbol(setCode) {
    var img = document.createElement('img');
    img.src = 'https://svgs.scryfall.io/sets/' + setCode + '.svg';
    img.alt = '';
    img.className = 'set-symbol';
    return img;
  }

  function createPlaceholder() {
    var ph = document.createElement('div');
    ph.className = 'card-image-placeholder';
    ph.textContent = '🃏';
    return ph;
  }

  // ===== DOM操作 =====

  function showLoading(visible) { loadingEl.classList.toggle('hidden', !visible); }
  function showError(message) { errorEl.textContent = 'エラーが発生しました: ' + message; errorEl.classList.remove('hidden'); }
  function hideError() { errorEl.classList.add('hidden'); }

  function resetDisplay() {
    cardGrid.innerHTML = '';
    setNav.innerHTML = '';
    setNav.classList.add('hidden');
    setSections = {};
    endMessageEl.classList.add('hidden');
    hideError();
  }

  function setNameToId(name) { return 'set-' + name.replace(/[^A-Za-z0-9]/g, '_'); }

  function getOrCreateSetSection(setName, releasedAt, setCode) {
    if (setSections[setName]) return setSections[setName];

    var sectionId = setNameToId(setName);
    var section = document.createElement('section');
    section.className = 'set-section';
    section.id = sectionId;
    section.dataset.releasedAt = releasedAt || '';

    var year = releasedAt ? releasedAt.substring(0, 4) + '年' : '';
    var label = setName + (year ? ' (' + year + ')' : '');

    var title = document.createElement('h2');
    title.className = 'set-title';
    if (setCode) title.appendChild(createSetSymbol(setCode));
    title.appendChild(document.createTextNode(label));

    var link = document.createElement('a');
    link.href = '#' + sectionId;
    link.className = 'set-nav-link';
    link.dataset.releasedAt = releasedAt || '';
    if (setCode) link.appendChild(createSetSymbol(setCode));
    var textSpan = document.createElement('span');
    textSpan.className = 'set-nav-text';
    textSpan.textContent = setName;
    link.appendChild(textSpan);
    setNav.appendChild(link);
    setNav.classList.remove('hidden');

    var grid = document.createElement('div');
    grid.className = 'set-card-grid';

    section.appendChild(title);
    section.appendChild(grid);
    cardGrid.appendChild(section);

    setSections[setName] = { grid: grid, section: section, releasedAt: releasedAt || '' };
    return setSections[setName];
  }

  function sortSetSections() {
    var byDate = function (a, b) { return (a.dataset.releasedAt || '').localeCompare(b.dataset.releasedAt || ''); };

    var sections = Array.prototype.slice.call(cardGrid.querySelectorAll('.set-section'));
    sections.sort(byDate).forEach(function (s) { cardGrid.appendChild(s); });

    var links = Array.prototype.slice.call(setNav.querySelectorAll('.set-nav-link'));
    links.sort(byDate).forEach(function (l) { setNav.appendChild(l); });
  }

  function createCardElement(card) {
    var imageUrl = getImageUrl(card);
    var priceText = formatPrice(card.prices);

    var el = document.createElement('a');
    el.className = 'card rarity-' + (card.rarity || 'common');
    el.dataset.cardName = card.name;
    el.href = getCardLinkUrl(card.name);
    el.target = '_blank';
    el.rel = 'noopener noreferrer';

    var imageWrapper = document.createElement('div');
    imageWrapper.className = 'card-image-wrapper';

    if (imageUrl) {
      var img = document.createElement('img');
      img.alt = card.name;
      img.loading = 'lazy';
      img.onerror = function () {
        imageWrapper.innerHTML = '';
        imageWrapper.appendChild(createPlaceholder());
      };
      img.src = imageUrl;
      imageWrapper.appendChild(img);
    } else {
      imageWrapper.appendChild(createPlaceholder());
    }

    var nameEl = document.createElement('h3');
    nameEl.className = 'card-name';
    nameEl.textContent = card.name;

    var priceEl = document.createElement('p');
    priceEl.className = priceText ? 'card-price' : 'card-price unavailable';
    priceEl.textContent = priceText || '価格情報なし';
    if (card.prices) {
      if (card.prices._rawFoilUsd !== undefined) {
        priceEl.dataset.usd = card.prices._rawFoilUsd;
      } else if (card.prices._rawFoilEur !== undefined) {
        priceEl.dataset.eur = card.prices._rawFoilEur;
      } else if (card.prices.usd) {
        priceEl.dataset.usd = parseFloat(card.prices.usd);
      }
    }

    var info = document.createElement('div');
    info.className = 'card-info';
    info.appendChild(nameEl);
    info.appendChild(priceEl);

    el.appendChild(imageWrapper);
    el.appendChild(info);
    return el;
  }

  function displayCards(cards) {
    if (!cards || cards.length === 0) return;
    cards.forEach(function (card) {
      var setName = card.set_name || '不明なセット';
      var sectionData = getOrCreateSetSection(setName, card.released_at, card.set);
      sectionData.grid.appendChild(createCardElement(card));
    });
    sortSetSections();
  }

  // ===== APIフェッチ =====

  function isExcluded(card) {
    if (EXCLUDED_SETS.indexOf(card.set_name) !== -1) return true;
    return EXCLUDED_PREFIXES.some(function (p) { return card.set_name.indexOf(p) === 0; });
  }

  function getFoilDisplayPrice(prices, priceKey) {
    if (!prices) return null;
    var usdFoil = prices[priceKey];
    if (usdFoil) return '$' + parseFloat(usdFoil).toFixed(2);
    if (prices.eur_foil) return '€' + parseFloat(prices.eur_foil).toFixed(2);
    return null;
  }

  /**
   * @param {string}   url
   * @param {number}   minPrice
   * @param {number}   fetchId
   * @param {function} onComplete
   * @param {string}   [priceKey='usd']   フィルタ・表示に使う価格フィールド
   * @param {boolean}  [noEarlyStop=false] true のとき価格での打ち切りを行わず全ページ走査する
   */
  function fetchChain(url, minPrice, fetchId, onComplete, priceKey, noEarlyStop) {
    priceKey = priceKey || 'usd';
    if (fetchId !== currentFetchId) return;

    hideError();
    showLoading(true);

    fetch(url)
      .then(function (response) {
        if (!response.ok) {
          return response.json().then(function (errData) {
            throw new Error((errData && errData.details) ? errData.details : 'HTTP ' + response.status);
          }, function () {
            throw new Error('HTTP ' + response.status);
          });
        }
        return response.json();
      })
      .then(function (data) {
        if (fetchId !== currentFetchId) return;

        var allCards = data.data || [];
        var isFoil = priceKey === 'usd_foil';

        var filtered = allCards.filter(function (card) {
          var price = card.prices && card.prices[priceKey];
          if (!price && isFoil) price = card.prices && card.prices.eur_foil;
          if (!price || parseFloat(price) < minPrice) return false;
          return !isExcluded(card);
        });

        if (isFoil) {
          filtered.forEach(function (card) {
            if (!card.prices) return;
            var usdFoil = card.prices[priceKey];
            if (usdFoil) {
              card.prices._rawFoilUsd = parseFloat(usdFoil);
            } else if (card.prices.eur_foil) {
              card.prices._rawFoilEur = parseFloat(card.prices.eur_foil);
            }
          });
        }

        displayCards(filtered);

        var reachedLimit = !noEarlyStop && allCards.some(function (card) {
          var price = card.prices && card.prices[priceKey];
          if (isFoil) return !price || parseFloat(price) < minPrice;
          return price !== null && price !== undefined && parseFloat(price) < minPrice;
        });

        if (!reachedLimit && data.has_more && data.next_page) {
          sleep(RATE_LIMIT_DELAY).then(function () {
            fetchChain(data.next_page, minPrice, fetchId, onComplete, priceKey, noEarlyStop);
          });
        } else {
          onComplete();
        }
      })
      .catch(function (error) {
        if (fetchId !== currentFetchId) return;
        showError(error.message);
        showLoading(false);
      });
  }

  // ===== フェッチ開始ヘルパー =====

  function beginFetch() {
    currentFetchId++;
    resetDisplay();
    return currentFetchId;
  }

  function completeFetch(fetchId) {
    if (fetchId !== currentFetchId) return;
    showLoading(false);
    endMessageEl.classList.remove('hidden');
  }

  function startSingleFetch(url, minPrice) {
    var fetchId = beginFetch();
    fetchChain(url, minPrice, fetchId, function () { completeFetch(fetchId); });
  }

  function startFoilFetch() {
    var fetchId = beginFetch();
    fetchChain(FOIL_URL, MIN_PRICE_FOIL, fetchId, function () {
      completeFetch(fetchId);
    }, 'usd_foil', true);
  }

  function startFetching(format) {
    var fetchId = beginFetch();
    fetchChain(buildUrl(format, 'common'), getCommonThreshold(), fetchId, function () {
      if (fetchId !== currentFetchId) return;
      sleep(RATE_LIMIT_DELAY).then(function () {
        fetchChain(buildUrl(format, 'uncommon'), getUncommonThreshold(), fetchId, function () {
          completeFetch(fetchId);
        });
      });
    });
  }

  // ===== イベントリスナー =====

  var tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.classList.contains('active')) return;
      tabBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');

      var format = btn.dataset.format;
      updateThresholdVisibility(format);
      if (format === 'basic_land') {
        startSingleFetch(BASIC_LAND_URL, getBasicLandThreshold());
      } else if (format === 'token') {
        startSingleFetch(TOKEN_URL, getTokenThreshold());
      } else if (format === 'foil') {
        startFoilFetch();
      } else {
        startFetching(format);
      }
    });
  });

  [commonThresholdEl, uncommonThresholdEl].forEach(function (sel) {
    sel.addEventListener('change', function () {
      var activeBtn = document.querySelector('.tab-btn.active');
      if (!activeBtn) return;
      var format = activeBtn.dataset.format;
      if (format === 'foil') {
        startFoilFetch();
      } else if (format !== 'basic_land' && format !== 'token') {
        startFetching(format);
      }
    });
  });

  basicLandThresholdEl.addEventListener('change', function () {
    var activeBtn = document.querySelector('.tab-btn.active');
    if (!activeBtn || activeBtn.dataset.format !== 'basic_land') return;
    startSingleFetch(BASIC_LAND_URL, getBasicLandThreshold());
  });

  tokenThresholdEl.addEventListener('change', function () {
    var activeBtn = document.querySelector('.tab-btn.active');
    if (!activeBtn || activeBtn.dataset.format !== 'token') return;
    startSingleFetch(TOKEN_URL, getTokenThreshold());
  });

  window.addEventListener('scroll', function () {
    backToTopBtn.classList.toggle('hidden', window.scrollY < 300);
  });

  backToTopBtn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  cardLinkSelectEl.addEventListener('change', function () {
    document.querySelectorAll('.card[data-card-name]').forEach(function (el) {
      el.href = getCardLinkUrl(el.dataset.cardName);
    });
  });

  currencySelectEl.addEventListener('change', function () {
    var currency = getCurrency();
    fetchExchangeRates(function () {
      document.querySelectorAll('.card-price[data-usd]').forEach(function (el) {
        el.textContent = convertFromUSD(parseFloat(el.dataset.usd), currency);
      });
      document.querySelectorAll('.card-price[data-eur]').forEach(function (el) {
        var eurVal = parseFloat(el.dataset.eur);
        if (currency === 'JPY' && exchangeRates.EUR && exchangeRates.JPY) {
          el.textContent = '¥' + Math.round((eurVal / exchangeRates.EUR) * exchangeRates.JPY).toLocaleString('ja-JP');
        } else if (currency === 'USD' && exchangeRates.EUR) {
          el.textContent = '$' + (eurVal / exchangeRates.EUR).toFixed(2);
        } else {
          el.textContent = '€' + eurVal.toFixed(2);
        }
      });
    });
  });

  // ===== 初期化 =====
  fetchExchangeRates();
  startFetching('y1993_2003');

})();
