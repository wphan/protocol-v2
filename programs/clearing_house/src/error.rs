use anchor_lang::prelude::*;

pub type ClearingHouseResult<T = ()> = std::result::Result<T, ErrorCode>;

#[error_code]
#[derive(PartialEq, Eq)]
pub enum ErrorCode {
    #[msg("Invalid Bank Authority")]
    InvalidBankAuthority,
    #[msg("Clearing house not insurance account owner")]
    InvalidInsuranceAccountAuthority,
    #[msg("Insufficient deposit")]
    InsufficientDeposit,
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    #[msg("Sufficient collateral")]
    SufficientCollateral,
    #[msg("Max number of positions taken")]
    MaxNumberOfPositions,
    #[msg("Admin Controls Prices Disabled")]
    AdminControlsPricesDisabled,
    #[msg("Market Index Not Initialized")]
    MarketIndexNotInitialized,
    #[msg("Market Index Already Initialized")]
    MarketIndexAlreadyInitialized,
    #[msg("User Account And User Positions Account Mismatch")]
    UserAccountAndUserPositionsAccountMismatch,
    #[msg("User Has No Position In Market")]
    UserHasNoPositionInMarket,
    #[msg("Invalid Initial Peg")]
    InvalidInitialPeg,
    #[msg("AMM repeg already configured with amt given")]
    InvalidRepegRedundant,
    #[msg("AMM repeg incorrect repeg direction")]
    InvalidRepegDirection,
    #[msg("AMM repeg out of bounds pnl")]
    InvalidRepegProfitability,
    #[msg("Slippage Outside Limit Price")]
    SlippageOutsideLimit,
    #[msg("Trade Size Too Small")]
    TradeSizeTooSmall,
    #[msg("Price change too large when updating K")]
    InvalidUpdateK,
    #[msg("Admin tried to withdraw amount larger than fees collected")]
    AdminWithdrawTooLarge,
    #[msg("Math Error")]
    MathError,
    #[msg("Conversion to u128/u64 failed with an overflow or underflow")]
    BnConversionError,
    #[msg("Clock unavailable")]
    ClockUnavailable,
    #[msg("Unable To Load Oracles")]
    UnableToLoadOracle,
    #[msg("Oracle/Mark Spread Too Large")]
    OracleMarkSpreadLimit,
    #[msg("Exchange is paused")]
    ExchangePaused,
    #[msg("Invalid whitelist token")]
    InvalidWhitelistToken,
    #[msg("Whitelist token not found")]
    WhitelistTokenNotFound,
    #[msg("Invalid discount token")]
    InvalidDiscountToken,
    #[msg("Discount token not found")]
    DiscountTokenNotFound,
    #[msg("Invalid referrer")]
    InvalidReferrer,
    #[msg("Referrer not found")]
    ReferrerNotFound,
    #[msg("InvalidOracle")]
    InvalidOracle,
    #[msg("OracleNotFound")]
    OracleNotFound,
    #[msg("Liquidations Blocked By Oracle")]
    LiquidationsBlockedByOracle,
    #[msg("Can not deposit more than max deposit")]
    UserMaxDeposit,
    #[msg("Can not delete user that still has collateral")]
    CantDeleteUserWithCollateral,
    #[msg("AMM funding out of bounds pnl")]
    InvalidFundingProfitability,
    #[msg("Casting Failure")]
    CastingFailure,
    #[msg("Invalid Order")]
    InvalidOrder,
    #[msg("User has no order")]
    UserHasNoOrder,
    #[msg("Order Amount Too Small")]
    OrderAmountTooSmall,
    #[msg("Max number of orders taken")]
    MaxNumberOfOrders,
    #[msg("Order does not exist")]
    OrderDoesNotExist,
    #[msg("Order not open")]
    OrderNotOpen,
    #[msg("FillOrderDidNotUpdateState")]
    FillOrderDidNotUpdateState,
    #[msg("Reduce only order increased risk")]
    ReduceOnlyOrderIncreasedRisk,
    #[msg("Unable to load AccountLoader")]
    UnableToLoadAccountLoader,
    #[msg("Trade Size Too Large")]
    TradeSizeTooLarge,
    #[msg("User cant refer themselves")]
    UserCantReferThemselves,
    #[msg("Did not receive expected referrer")]
    DidNotReceiveExpectedReferrer,
    #[msg("Could not deserialize referrer")]
    CouldNotDeserializeReferrer,
    #[msg("User Order Id Already In Use")]
    UserOrderIdAlreadyInUse,
    #[msg("No positions liquidatable")]
    NoPositionsLiquidatable,
    #[msg("Invalid Margin Ratio")]
    InvalidMarginRatio,
    #[msg("Cant Cancel Post Only Order")]
    CantCancelPostOnlyOrder,
    #[msg("InvalidOracleOffset")]
    InvalidOracleOffset,
    #[msg("CantExpireOrders")]
    CantExpireOrders,
    #[msg("CouldNotLoadMarketData")]
    CouldNotLoadMarketData,
    #[msg("MarketNotFound")]
    MarketNotFound,
    #[msg("InvalidMarketAccount")]
    InvalidMarketAccount,
    #[msg("UnableToLoadMarketAccount")]
    UnableToLoadMarketAccount,
    #[msg("MarketWrongMutability")]
    MarketWrongMutability,
    #[msg("UnableToCastUnixTime")]
    UnableToCastUnixTime,
    #[msg("CouldNotFindBankBalance")]
    CouldNotFindBankBalance,
    #[msg("NoUserBankBalanceAvailable")]
    NoUserBankBalanceAvailable,
    #[msg("InvalidBankInitialization")]
    InvalidBankInitialization,
    #[msg("CouldNotLoadBankData")]
    CouldNotLoadBankData,
    #[msg("BankNotFound")]
    BankNotFound,
    #[msg("InvalidBankAccount")]
    InvalidBankAccount,
    #[msg("UnableToLoadBankAccount")]
    UnableToLoadBankAccount,
    #[msg("BankWrongMutability")]
    BankWrongMutability,
    #[msg("BankInterestNotUpToDate")]
    BankInterestNotUpToDate,
    #[msg("BankInsufficientDeposits")]
    BankInsufficientDeposits,
    #[msg("UserMustSettleTheirOwnPositiveUnsettledPNL")]
    UserMustSettleTheirOwnPositiveUnsettledPNL,
    #[msg("CantUpdatePoolBalanceType")]
    CantUpdatePoolBalanceType,
    #[msg("InsufficientCollateralForSettlingPNL")]
    InsufficientCollateralForSettlingPNL,
    #[msg("AMMNotUpdatedInSameSlot")]
    AMMNotUpdatedInSameSlot,
    #[msg("AuctionNotComplete")]
    AuctionNotComplete,
    #[msg("MakerNotFound")]
    MakerNotFound,
    #[msg("MakerNotFound")]
    MakerStatsNotFound,
    #[msg("MakerMustBeWritable")]
    MakerMustBeWritable,
    #[msg("MakerMustBeWritable")]
    MakerStatsMustBeWritable,
    #[msg("MakerOrderNotFound")]
    MakerOrderNotFound,
    #[msg("CouldNotDeserializeMaker")]
    CouldNotDeserializeMaker,
    #[msg("CouldNotDeserializeMaker")]
    CouldNotDeserializeMakerStats,
    #[msg("AuctionPriceDoesNotSatisfyMaker")]
    AuctionPriceDoesNotSatisfyMaker,
    #[msg("MakerCantFulfillOwnOrder")]
    MakerCantFulfillOwnOrder,
    #[msg("MakerOrderMustBePostOnly")]
    MakerOrderMustBePostOnly,
    #[msg("CantMatchTwoPostOnlys")]
    CantMatchTwoPostOnlys,
    #[msg("OrderBreachesOraclePriceLimits")]
    OrderBreachesOraclePriceLimits,
    #[msg("OrderMustBeTriggeredFirst")]
    OrderMustBeTriggeredFirst,
    #[msg("OrderNotTriggerable")]
    OrderNotTriggerable,
    #[msg("OrderDidNotSatisfyTriggerCondition")]
    OrderDidNotSatisfyTriggerCondition,
    #[msg("PositionAlreadyBeingLiquidated")]
    PositionAlreadyBeingLiquidated,
    #[msg("PositionDoesntHaveOpenPositionOrOrders")]
    PositionDoesntHaveOpenPositionOrOrders,
    #[msg("AllOrdersAreAlreadyLiquidations")]
    AllOrdersAreAlreadyLiquidations,
    #[msg("CantCancelLiquidationOrder")]
    CantCancelLiquidationOrder,
    #[msg("UserIsBeingLiquidated")]
    UserIsBeingLiquidated,
    #[msg("LiquidationsOngoing")]
    LiquidationsOngoing,
    #[msg("WrongBankBalanceType")]
    WrongBankBalanceType,
    #[msg("UserCantLiquidateThemself")]
    UserCantLiquidateThemself,
    #[msg("InvalidPerpPositionToLiquidate")]
    InvalidPerpPositionToLiquidate,
    #[msg("InvalidBaseAssetAmountForLiquidatePerp")]
    InvalidBaseAssetAmountForLiquidatePerp,
    #[msg("InvalidPositionLastFundingRate")]
    InvalidPositionLastFundingRate,
    #[msg("InvalidPositionDelta")]
    InvalidPositionDelta,
    #[msg("UserBankrupt")]
    UserBankrupt,
    #[msg("UserNotBankrupt")]
    UserNotBankrupt,
    #[msg("UserHasInvalidBorrow")]
    UserHasInvalidBorrow,
    #[msg("BankDailyWithdrawLimit")]
    BankDailyWithdrawLimit,
    #[msg("DefaultError")]
    DefaultError,
    #[msg("Insufficient LP tokens")]
    InsufficientLPTokens,
    #[msg("Cant LP with a market position")]
    CantLPWithMarketPosition,
    #[msg("Unable to burn LP tokens")]
    UnableToBurnLPTokens,
    #[msg("Trying to remove liqudity too fast after adding it")]
    TryingToRemoveLiquidityTooFast,
}

#[macro_export]
macro_rules! print_error {
    ($err:expr) => {{
        || {
            let error_code: ErrorCode = $err;
            msg!("{:?} thrown at {}:{}", error_code, file!(), line!());
            $err
        }
    }};
}

#[macro_export]
macro_rules! math_error {
    () => {{
        || {
            let error_code = $crate::error::ErrorCode::MathError;
            msg!("Error {} thrown at {}:{}", error_code, file!(), line!());
            error_code
        }
    }};
}
