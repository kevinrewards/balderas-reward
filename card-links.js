/* Local previews open local cards, but a QR/shared link must work on a phone. */
window.LoyaltyLinks = {
  publishedBase: "https://kevinrewards.github.io/balderas-reward/",
  build(page, token, { portable = false, href = window.location.href } = {}) {
    const location = new URL(href);
    const base = portable && location.protocol === "file:" ? this.publishedBase : location.href;
    const url = new URL(page, base);
    url.searchParams.set("token", token);
    return url.href;
  }
};
