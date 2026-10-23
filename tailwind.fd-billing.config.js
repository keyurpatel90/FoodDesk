module.exports = {
  content: [
    './components/SubscriptionLockout.tsx', './components/SubscriptionCards.tsx', './components/BillingSettingsView.tsx',
    './components/RazorpayModal.tsx', './components/PricingModal.tsx', './components/SubscriptionBanner.tsx', './components/BillingDrawer.tsx',
  ],
  // Every utility is scoped under .fd-billing, so nothing can leak into the rest of the app.
  important: '.fd-billing',
  corePlugins: { preflight: false },
  theme: { extend: {} },
};
