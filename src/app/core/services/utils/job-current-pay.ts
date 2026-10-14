import { Job } from "../../models/job.model";
import { lineTotal } from "./report-material-comparison";


/** Use the current material total, matching the job editor's necessaryTotal(). */
export function withCurrentMaterialPay(job: Job): Job {
  // A response without materials cannot be recalculated safely.
  if (!Array.isArray(job.materials)) return job;

  const seen = new Set<number>();
  let cents = 0;
  for (const material of job.materials) {
    // The editor's addNecessary() also keeps one row per material.
    if (seen.has(material.materialId)) continue;
    seen.add(material.materialId);
    const quantity = material.quantity ?? 1;
    const price = material.price;
    if (!Number.isFinite(quantity) || quantity < 0
        || !Number.isFinite(price) || price < 0) return job;
    cents += Math.round(lineTotal(quantity, price) * 100);
  }
  if (!Number.isFinite(cents)) return job;
  return { ...job, pay: cents / 100 };
}
