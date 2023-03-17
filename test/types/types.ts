import { BigNumber } from "ethers";

export interface Times {
  currentYear: BigNumber;
  claimableMonth: BigNumber;
  newPeriodStartTime: BigNumber;
}
