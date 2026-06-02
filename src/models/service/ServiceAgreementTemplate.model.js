import mongoose from 'mongoose';

const serviceAgreementTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    default: 'default'
  },
  term1: {
    type: String,
    required: true,
    default: 'All dispensers installed under this Agreement are owned by and shall remain the property of Enviro-Master Services, here noted as the Company. Damage to any Company dispenser due to vandalism, abuse, or theft, Company will replace the dispenser(s) at the then current replacement rate.'
  },
  term2: {
    type: String,
    required: true,
    default: "Enviro-Master Promise of Good Service. In the event that Customer: (1) provides a written material complaint to Company; (2) Company does not cure, address or resolve the Complaint within a fifteen-day period of receipt; and, 3) Customer has paid all fees and provided Company the opportunity to retrieve its dispensers from Customer premises in good condition – Customer may then terminate Company's services by providing thirty (30) days written notice of its intention to do so."
  },
  term3: {
    type: String,
    required: true,
    default: "Payment Terms. If Customer has elected credit card payment through Company's eBill program, customer agrees to submit payment by the first business day of each month for Company's services/products provided in the previous month. If Customer has elected Net 30 payment terms, then Company will invoice Customer on the first business day of each month for services/products provided during the previous month. Customer agrees to pay monthly statement no later than the first business day of the following month. If the outstanding balance is not paid in full within 45 days of billing, Company has the right to terminate this Agreement. All invoices shall be deemed true and correct unless Customer provides a written objection to an invoice to Company within thirty (30) days of the due date of such invoice. Any invoice not paid within thirty (30) days of billing shall be subject to a finance charge equal to 1.5 percent per month or the highest amount allowed by law, whichever is less. Should any check remittance be returned for insufficient funds (\"ISF\"), Customer expressly authorizes Company to electronically debit or draft from its bank account the amount of such check remittance, plus any ISF fees incurred by Company. Customer agrees to pay all reasonable attorney fees and costs to enforce this Agreement. Company may increase charges from time to time by notifying Customer in writing which may be on Customer's invoice or monthly statement. Customer agrees to pay a $10 charge for each incident in which Customer refuses Company's scheduled services."
  },
  term4: {
    type: String,
    required: true,
    default: "Indemnification. Customer shall protect, defend, indemnify, and hold Company harmless from all third-party claims, losses, damages, costs, and expenses (including attorney's fees) and which arise in connection with this Agreement and with Customer's interim cleaning and use of any products in its restroom facilities. The Customer acknowledges and understands that Enviro-Master makes no additional representations of any kind or nature regarding the use of the Vaporizer/Sani-Guard disinfectants beyond those made by the manufacturer as to its EPA registration status and safety."
  },
  term5: {
    type: String,
    required: true,
    default: "Expiration/Termination. Upon the expiration or termination of this Agreement, Customer shall remit any unpaid charges and immediately, permit Company to retrieve all dispensers on its premises. Company has no obligation to reinstall Customer's dispensers. Company is not liable for damages to Customer's property (except for gross negligence) should Company removes its dispensers. If this Agreement is terminated early for any reason, other than under the Enviro- Master Promise of Good Service, Customer will pay Company, as liquidated damages, 50% of its average weekly invoice (over the previous thirteen-week period) and multiplied by the number of weeks remaining in the unexpired Agreement term, plus the replacement cost of all dispensers in service."
  },
  term6: {
    type: String,
    required: true,
    default: "Install Warranty/Scope of Service. Company's install warranty to repair or replace dispensers refers to normal wear and tear, manufacture malfunction or defect. Company's warranty does not cover vandalism or abuse. Company will perform all work set forth in its cleaning/sanitizing scope of service for Customer in a good and workman-like manner."
  },
  term7: {
    type: String,
    required: true,
    default: "Sale of Customer Business. If Customer sells or transfers its business (whether by asset sale, stock sale or otherwise), new owner or operator will assume this agreement."
  },
  noteText: {
    type: String,
    required: true,
    default: "Agreement term shall be for thirty-six (36) months from execution and shall automatically renew for another like term unless Enviro-Master is provided written notice of Customer's desire to discontinue service thirty (30) days prior to expiration of any term. This Agreement is subject to the terms and conditions on its reverse side."
  },
  titleText: {
    type: String,
    required: true,
    default: "SERVICE AGREEMENT"
  },
  subtitleText: {
    type: String,
    required: true,
    default: "Terms and Conditions"
  },
  retainDispensersLabel: {
    type: String,
    required: true,
    default: "Customer desires to retain existing dispensers"
  },
  disposeDispensersLabel: {
    type: String,
    required: true,
    default: "Customer desires to dispose of existing dispensers"
  },
  emSalesRepLabel: {
    type: String,
    required: true,
    default: "EM Sales Representative"
  },
  insideSalesRepLabel: {
    type: String,
    required: true,
    default: "Inside SalesRepresentative"
  },
  authorityText: {
    type: String,
    required: true,
    default: "I HEREBY REPRESENT THAT I HAVE THE AUTHORITY TO SIGN THIS AGREEMENT:"
  },
  customerContactLabel: {
    type: String,
    required: true,
    default: "Customer Contact Name"
  },
  customerSignatureLabel: {
    type: String,
    required: true,
    default: "Customer Signature"
  },
  customerDateLabel: {
    type: String,
    required: true,
    default: "Date"
  },
  emFranchiseeLabel: {
    type: String,
    required: true,
    default: "EM Franchisee Name"
  },
  emSignatureLabel: {
    type: String,
    required: true,
    default: "EM Signature"
  },
  emDateLabel: {
    type: String,
    required: true,
    default: "Date"
  },
  pageNumberText: {
    type: String,
    required: true,
    default: "PAGE 4"
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

serviceAgreementTemplateSchema.index({ isActive: 1 });

serviceAgreementTemplateSchema.pre('save', async function(next) {
  if (this.isActive && this.isModified('isActive')) {
    await mongoose.model('ServiceAgreementTemplate').updateMany(
      { _id: { $ne: this._id }, isActive: true },
      { isActive: false }
    );
  }
  next();
});

const ServiceAgreementTemplate = mongoose.model('ServiceAgreementTemplate', serviceAgreementTemplateSchema);

export default ServiceAgreementTemplate;
