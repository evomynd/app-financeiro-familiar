import Decimal from "decimal.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export class Money {
  private readonly amount: Decimal;

  constructor(value: number | string | Decimal) {
    this.amount = new Decimal(value);
  }

  static fromCents(cents: number): Money {
    return new Money(new Decimal(cents).dividedBy(100));
  }

  add(other: Money): Money {
    return new Money(this.amount.plus(other.amount));
  }

  subtract(other: Money): Money {
    return new Money(this.amount.minus(other.amount));
  }

  multiply(factor: number | string): Money {
    return new Money(this.amount.times(factor));
  }

  divide(divisor: number | string): Money {
    return new Money(this.amount.dividedBy(divisor));
  }

  toNumber(): number {
    return this.amount.toNumber();
  }

  toCents(): number {
    return this.amount.times(100).round().toNumber();
  }

  toString(): string {
    return this.amount.toFixed(2);
  }

  toJSON(): number {
    return this.toNumber();
  }

  isPositive(): boolean {
    return this.amount.greaterThan(0);
  }

  isNegative(): boolean {
    return this.amount.lessThan(0);
  }

  isZero(): boolean {
    return this.amount.equals(0);
  }

  abs(): Money {
    return new Money(this.amount.abs());
  }

  static sum(values: Money[]): Money {
    return values.reduce((acc, val) => acc.add(val), new Money(0));
  }

  static average(values: Money[]): Money {
    if (values.length === 0) return new Money(0);
    return Money.sum(values).divide(values.length);
  }
}
