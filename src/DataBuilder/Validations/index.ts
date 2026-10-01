import { EmailValidationType } from "./EmailValidationType";
import { LengthValidationType } from "./LengthValidationType";
import { MinValidationType } from "./MinValidationType";
import { MaxValidationType } from "./MaxValidationType";

export { EmailValidationType, LengthValidationType, MinValidationType, MaxValidationType };

export function standardDataBuilderValidations() {
    return [new EmailValidationType(), new LengthValidationType(), new MinValidationType(), new MaxValidationType()];
}
