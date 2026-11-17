// jsdom lacks ResizeObserver (used by recharts' ResponsiveContainer)
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || RO;
(window as any).confirm = () => true;
