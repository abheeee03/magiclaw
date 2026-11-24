use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid odds, radius, fee, or timing parameter")]
    InvalidConfig,
    #[msg("Signer is neither the admin, the owner, nor a valid session key")]
    Unauthorized,
    #[msg("Session key has expired")]
    SessionKeyExpired,
    #[msg("Instruction called from a disallowed session state")]
    InvalidState,
    #[msg("USDC balance is insufficient")]
    InsufficientBalance,
    #[msg("The play window has expired")]
    PlayWindowExpired,
    #[msg("Slot id or coordinates are out of bounds")]
    InvalidSlot,
    #[msg("VRF callback signer is not the scoped program identity")]
    UnauthorizedVrfCallback,
    #[msg("The supplied price feed does not match the slot configuration")]
    InvalidPriceFeed,
    #[msg("Nothing to settle: nonce already consumed or zero delta")]
    NothingToSettle,
    #[msg("Checked arithmetic overflow")]
    MathOverflow,
    #[msg("The oracle account cannot be decoded")]
    InvalidOracleAccount,
    #[msg("The VRF request is not yet eligible for cancellation")]
    VrfStillLive,
    #[msg("The vault account does not match the machine configuration")]
    InvalidVault,
}
