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

  var BASIC_LAND_URL    = API_BASE + '?q=t%3Abasic' + SET_FILTERS + QUERY_SUFFIX;
  var TOKEN_URL         = API_BASE + '?q=%28is%3Atoken+OR+t%3Aemblem%29' + SET_FILTERS + QUERY_SUFFIX;
  // Scryfall API は foil 価格でのソート/フィルタ不可。全ページ走査してクライアント側で判定する
  var FOIL_COMMON_URL   = API_BASE + '?q=is%3Afoil+r%3Acommon'   + QUERY_FILTERS + '&order=usd&dir=desc&unique=prints';
  var FOIL_UNCOMMON_URL = API_BASE + '?q=is%3Afoil+r%3Auncommon' + QUERY_FILTERS + '&order=usd&dir=desc&unique=prints';

  var RATE_LIMIT_DELAY = 100; // ms

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

  // フォーマット別 URL 生成
  function buildUrl(format, rarity) {
    return API_BASE + '?q=r%3A' + rarity + QUERY_FILTERS + '+' + FORMATS[format] + QUERY_SUFFIX;
  }

  // ===== 状態 =====
  var currentFetchId = 0;
  var setSections = {};
  var exchangeRates = { JPY: null, EUR: null };
  var ratesFetched = false;

  // ===== DOM要素 =====
  var cardGrid     = document.getElementById('card-grid');
  var setNav       = document.getElementById('set-nav');
  var loadingEl    = document.getElementById('loading');
  var backToTopBtn = document.getElementById('back-to-top');
  var errorEl      = document.getElementById('error-message');
  var endMessageEl = document.getElementById('end-message');
  var currencySelectEl = document.getElementById('currency-select');
  var cardLinkSelectEl = document.getElementById('card-link-select');

  var thresholdEls = {
    common:      document.getElementById('common-threshold'),
    uncommon:    document.getElementById('uncommon-threshold'),
    basicLand:   document.getElementById('basic-land-threshold'),
    token:       document.getElementById('token-threshold'),
    foilCommon:  document.getElementById('foil-common-threshold'),
    foilUncommon: document.getElementById('foil-uncommon-threshold')
  };

  var thresholdLabelEls = {
    common:      document.getElementById('common-threshold-label'),
    uncommon:    document.getElementById('uncommon-threshold-label'),
    basicLand:   document.getElementById('basic-land-threshold-label'),
    token:       document.getElementById('token-threshold-label'),
    foilCommon:  document.getElementById('foil-common-threshold-label'),
    foilUncommon: document.getElementById('foil-uncommon-threshold-label')
  };

  // タブごとに表示する threshold キーの対応表
  var THRESHOLD_VISIBILITY = {
    basic_land: ['basicLand'],
    token:      ['token'],
    foil:       ['foilCommon', 'foilUncommon']
  };

  function threshold(key) { return parseFloat(thresholdEls[key].value); }
  function getCurrency()  { return currencySelectEl.value; }

  // ===== threshold 表示切り替え =====

  function updateThresholdVisibility(format) {
    var visibleKeys = THRESHOLD_VISIBILITY[format] || ['common', 'uncommon'];
    Object.keys(thresholdLabelEls).forEach(function (key) {
      thresholdLabelEls[key].classList.toggle('hidden', visibleKeys.indexOf(key) === -1);
    });
  }

  // ===== カードリンク =====

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

  /**
   * @param {string}   url
   * @param {number}   minPrice
   * @param {number}   fetchId
   * @param {function} onComplete
   * @param {string}   [priceKey='usd']    フィルタ・表示に使う価格フィールド
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

  // 2段階 fetch（common→uncommon など）の共通パターン
  function startFetchPair(url1, price1, url2, price2, priceKey, noEarlyStop) {
    var fetchId = beginFetch();
    fetchChain(url1, price1, fetchId, function () {
      if (fetchId !== currentFetchId) return;
      sleep(RATE_LIMIT_DELAY).then(function () {
        fetchChain(url2, price2, fetchId, function () {
          completeFetch(fetchId);
        }, priceKey, noEarlyStop);
      });
    }, priceKey, noEarlyStop);
  }

  function startFetching(format) {
    startFetchPair(
      buildUrl(format, 'common'),   threshold('common'),
      buildUrl(format, 'uncommon'), threshold('uncommon')
    );
  }

  function startFoilFetch() {
    startFetchPair(
      FOIL_COMMON_URL,   threshold('foilCommon'),
      FOIL_UNCOMMON_URL, threshold('foilUncommon'),
      'usd_foil', true
    );
  }

  // ===== タブ実行 =====

  function runTab(format) {
    if (format === 'basic_land') {
      startSingleFetch(BASIC_LAND_URL, threshold('basicLand'));
    } else if (format === 'token') {
      startSingleFetch(TOKEN_URL, threshold('token'));
    } else if (format === 'foil') {
      startFoilFetch();
    } else {
      startFetching(format);
    }
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
      runTab(format);
    });
  });

  Object.keys(thresholdEls).forEach(function (key) {
    thresholdEls[key].addEventListener('change', function () {
      var activeBtn = document.querySelector('.tab-btn.active');
      if (activeBtn) runTab(activeBtn.dataset.format);
    });
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
