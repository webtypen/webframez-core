import { EmailValidationType } from "./EmailValidationType";
import { LengthValidationType } from "./LengthValidationType";
import { MinValidationType } from "./MinValidationType";
import { MaxValidationType } from "./MaxValidationType";
export { EmailValidationType, LengthValidationType, MinValidationType, MaxValidationType };
export declare function standardDataBuilderValidations(): (EmailValidationType | LengthValidationType | MinValidationType | MaxValidationType)[];
