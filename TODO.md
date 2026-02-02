- [ ] Fix werror in gometric when in reddit at least:
```
GoMetric: Currency API failed TypeError: NetworkError when attempting to fetch resource.
    fetch https://www.reddit.com/:41
    apply https://www.redditstatic.com/shreddit/en-US/B5GWaN1-XM.js:2
    fetchRates moz-extension://522dc872-2191-4974-a1e1-be033187cd46/ GoMetric.user.js#13:138
    transformCurrency moz-extension://522dc872-2191-4974-a1e1-be033187cd46/ GoMetric.user.js#13:530
    transformText moz-extension://522dc872-2191-4974-a1e1-be033187cd46/ GoMetric.user.js#13:613
    processTextNode moz-extension://522dc872-2191-4974-a1e1-be033187cd46/ GoMetric.user.js#13:750
    walkDOM moz-extension://522dc872-2191-4974-a1e1-be033187cd46/ GoMetric.user.js#13:763
    processPendingMutations moz-extension://522dc872-2191-4974-a1e1-be033187cd46/ GoMetric.user.js#13:821
    processPendingMutations moz-extension://522dc872-2191-4974-a1e1-be033187cd46/ GoMetric.user.js#13:819
    processPendingMutations moz-extension://522dc872-2191-4974-a1e1-be033187cd46/ GoMetric.user.js#13:817
    mutationTimeout moz-extension://522dc872-2191-4974-a1e1-be033187cd46/ GoMetric.user.js#13:842
    setTimeout handler*VMt7hz1im99v/</observer< moz-extension://522dc872-2191-4974-a1e1-be033187cd46/ GoMetric.user.js#13:841
<anonymous code>:1:147461
Content-Security-Policy: The page’s settings blocked the loading of a resource (connect-src) at https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json because it violates the following directive: “connect-src 'self' https://events.redditmedia.com https://o418887.ingest.sentry.io https://*.redd.it https://*.reddit.com https://www.redditstatic.com https://vimeo.com https://alb.reddit.com https://accounts.google.com/gsi/ https://www.google.com/recaptcha/ https://w3-reporting.reddit.com https://reddit-uploaded-emoji.s3-accelerate.amazonaws.com https://reddit-uploaded-media.s3-accelerate.amazonaws.com https://reddit-uploaded-video.s3-accelerate.amazonaws.com https://reddit-subreddit-uploaded-media.s3-accelerate.amazonaws.com wss://*.wss.redditmedia.com wss://gql-realtime.reddit.com https://*.giphy.com https://js.stripe.com https://support.reddithelp.com https://matrix.redditspace.com https://www.google.com/ccm/ https://styles.redditmedia.com https://a.thumbs.redditmedia.com https://b.thumbs.redditmedia.com”
```
