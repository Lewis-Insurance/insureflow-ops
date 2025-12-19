import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useMovedCarriers } from "@/hooks/useMovedCarriers";
import { Loader2 } from "lucide-react";
import type { AORenewalTerm } from "@/hooks/useAORenewals";

interface MovedStatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: {
    carrier: string;
    term: AORenewalTerm;
    premium: number;
  }) => void;
  customerName?: string;
}

export function MovedStatusModal({
  open,
  onOpenChange,
  onConfirm,
  customerName,
}: MovedStatusModalProps) {
  const [carrier, setCarrier] = useState<string>("");
  const [term, setTerm] = useState<AORenewalTerm>("annual");
  const [premium, setPremium] = useState<string>("");
  const [errors, setErrors] = useState<{
    carrier?: string;
    term?: string;
    premium?: string;
  }>({});

  const { data: carriers = [], isLoading: isLoadingCarriers } = useMovedCarriers();

  const handleSubmit = () => {
    const newErrors: typeof errors = {};

    if (!carrier) {
      newErrors.carrier = "Please select a carrier";
    }

    if (!term) {
      newErrors.term = "Please select a policy term";
    }

    const premiumValue = parseFloat(premium);
    if (!premium || isNaN(premiumValue) || premiumValue <= 0) {
      newErrors.premium = "Please enter a valid premium amount";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onConfirm({
      carrier,
      term,
      premium: premiumValue,
    });

    // Reset form
    setCarrier("");
    setTerm("annual");
    setPremium("");
    setErrors({});
  };

  const handleCancel = () => {
    setCarrier("");
    setTerm("annual");
    setPremium("");
    setErrors({});
    onOpenChange(false);
  };

  const formatPremiumInput = (value: string) => {
    // Remove non-numeric characters except decimal point
    const cleaned = value.replace(/[^0-9.]/g, "");
    // Ensure only one decimal point
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      return parts[0] + "." + parts.slice(1).join("");
    }
    // Limit to 2 decimal places
    if (parts[1]?.length > 2) {
      return parts[0] + "." + parts[1].slice(0, 2);
    }
    return cleaned;
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Mark as Moved</DialogTitle>
          <DialogDescription>
            {customerName
              ? `Enter the details for ${customerName}'s policy that was moved to another carrier.`
              : "Enter the details for the policy that was moved to another carrier."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Carrier Selection */}
          <div className="grid gap-2">
            <Label htmlFor="carrier">
              Carrier <span className="text-destructive">*</span>
            </Label>
            {isLoadingCarriers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading carriers...
              </div>
            ) : (
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger
                  id="carrier"
                  className={errors.carrier ? "border-destructive" : ""}
                >
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent>
                  {carriers.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.carrier && (
              <p className="text-sm text-destructive">{errors.carrier}</p>
            )}
          </div>

          {/* Policy Term */}
          <div className="grid gap-2">
            <Label>
              Policy Term <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={term}
              onValueChange={(value) => setTerm(value as AORenewalTerm)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="6_month" id="term-6month" />
                <Label htmlFor="term-6month" className="font-normal cursor-pointer">
                  6 Months
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="annual" id="term-annual" />
                <Label htmlFor="term-annual" className="font-normal cursor-pointer">
                  Annual
                </Label>
              </div>
            </RadioGroup>
            {errors.term && (
              <p className="text-sm text-destructive">{errors.term}</p>
            )}
          </div>

          {/* Premium */}
          <div className="grid gap-2">
            <Label htmlFor="premium">
              Premium <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="premium"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={premium}
                onChange={(e) => setPremium(formatPremiumInput(e.target.value))}
                className={`pl-7 ${errors.premium ? "border-destructive" : ""}`}
              />
            </div>
            {errors.premium && (
              <p className="text-sm text-destructive">{errors.premium}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Enter the new premium amount for the policy
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Confirm Move</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
