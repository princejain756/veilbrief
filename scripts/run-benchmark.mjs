import { evaluateBenchmark } from "../packages/core/dist/index.js";

const metrics = evaluateBenchmark();
console.log(
  JSON.stringify(
    {
      ...metrics,
      precision: Number(metrics.precision.toFixed(4)),
      recall: Number(metrics.recall.toFixed(4)),
      f1: Number(metrics.f1.toFixed(4)),
    },
    null,
    2,
  ),
);
