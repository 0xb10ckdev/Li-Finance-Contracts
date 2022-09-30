// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { IERC20 } from "@axelar-network/axelar-cgp-solidity/contracts/interfaces/IERC20.sol";
import { ReentrancyGuard } from "../Helpers/ReentrancyGuard.sol";
import { LibSwap } from "../Libraries/LibSwap.sol";
import { LibAsset } from "../Libraries/LibAsset.sol";
import { ILiFi } from "../Interfaces/ILiFi.sol";
import { IERC20Proxy } from "../Interfaces/IERC20Proxy.sol";
import { TransferrableOwnership } from "../Helpers/TransferrableOwnership.sol";

/// @title Executor
/// @author LI.FI (https://li.fi)
/// @notice Arbitrary execution contract used for cross-chain swaps and message passing
contract Executor is ILiFi, ReentrancyGuard, TransferrableOwnership {
    /// Storage ///
    IERC20Proxy public erc20Proxy;

    /// Errors ///
    error ExecutionFailed();
    error InvalidCaller();

    /// Events ///
    event ERC20ProxySet(address indexed proxy);

    /// Modifiers ///

    /// @dev Sends any leftover balances back to the user
    modifier noLeftovers(LibSwap.SwapData[] calldata _swaps, address payable _leftoverReceiver) {
        uint256 nSwaps = _swaps.length;
        if (nSwaps != 1) {
            uint256[] memory initialBalances = _fetchBalances(_swaps);
            address finalAsset = _swaps[nSwaps - 1].receivingAssetId;
            uint256 curBalance = 0;

            _;

            for (uint256 i = 0; i < nSwaps - 1; ) {
                address curAsset = _swaps[i].receivingAssetId;
                // Handle multi-to-one swaps
                if (curAsset != finalAsset) {
                    curBalance = LibAsset.getOwnBalance(curAsset) - initialBalances[i];
                    if (curBalance > 0) LibAsset.transferAsset(curAsset, _leftoverReceiver, curBalance);
                }
                unchecked {
                    ++i;
                }
            }
        } else _;
    }

    /// Constructor
    constructor(address _owner, address _erc20Proxy) TransferrableOwnership(_owner) {
        owner = _owner;
        erc20Proxy = IERC20Proxy(_erc20Proxy);
        emit ERC20ProxySet(_erc20Proxy);
    }

    /// External Methods ///

    /// @notice set ERC20 Proxy
    /// @param _erc20Proxy the address of the ERC20Proxy contract
    function setERC20Proxy(address _erc20Proxy) external onlyOwner {
        erc20Proxy = IERC20Proxy(_erc20Proxy);
        emit ERC20ProxySet(_erc20Proxy);
    }

    /// @notice Performs a swap before completing a cross-chain transaction
    /// @param _transactionId the transaction id for the swap
    /// @param _swapData array of data needed for swaps
    /// @param transferredAssetId token received from the other chain
    /// @param receiver address that will receive tokens in the end
    function swapAndCompleteBridgeTokens(
        bytes32 _transactionId,
        LibSwap.SwapData[] calldata _swapData,
        address transferredAssetId,
        address payable receiver
    ) external payable nonReentrant {
        uint256 startingBalance;
        uint256 finalAssetStartingBalance;
        address finalAssetId = _swapData[_swapData.length - 1].receivingAssetId;

        if (!LibAsset.isNativeAsset(finalAssetId)) {
            finalAssetStartingBalance = LibAsset.getOwnBalance(finalAssetId);
        } else {
            finalAssetStartingBalance = LibAsset.getOwnBalance(finalAssetId) - msg.value;
        }

        if (!LibAsset.isNativeAsset(transferredAssetId)) {
            startingBalance = LibAsset.getOwnBalance(transferredAssetId);
            uint256 allowance = IERC20(transferredAssetId).allowance(msg.sender, address(this));
            LibAsset.depositAsset(transferredAssetId, allowance);
        } else {
            startingBalance = LibAsset.getOwnBalance(transferredAssetId) - msg.value;
        }

        _executeSwaps(_transactionId, _swapData, receiver);

        uint256 postSwapBalance = LibAsset.getOwnBalance(transferredAssetId);
        if (postSwapBalance > startingBalance) {
            LibAsset.transferAsset(transferredAssetId, receiver, postSwapBalance - startingBalance);
        }

        uint256 finalAssetPostSwapBalance = LibAsset.getOwnBalance(finalAssetId);
        uint256 finalAssetSendAmount = finalAssetPostSwapBalance - finalAssetStartingBalance;

        if (finalAssetSendAmount > 0) {
            LibAsset.transferAsset(finalAssetId, receiver, finalAssetSendAmount);
        }

        emit LiFiTransferCompleted(_transactionId, transferredAssetId, receiver, finalAssetSendAmount, block.timestamp);
    }

    /// @notice Performs a series of swaps or arbitrary executions
    /// @param _transactionId the transaction id for the swap
    /// @param _swapData array of data needed for swaps
    /// @param transferredAssetId token received from the other chain
    /// @param receiver address that will receive tokens in the end
    function swapAndExecute(
        bytes32 _transactionId,
        LibSwap.SwapData[] calldata _swapData,
        address transferredAssetId,
        address payable receiver,
        uint256 amount
    ) external payable nonReentrant {
        uint256 startingBalance;
        uint256 finalAssetStartingBalance;
        address finalAssetId = _swapData[_swapData.length - 1].receivingAssetId;

        if (!LibAsset.isNativeAsset(finalAssetId)) {
            finalAssetStartingBalance = LibAsset.getOwnBalance(finalAssetId);
        } else {
            finalAssetStartingBalance = LibAsset.getOwnBalance(finalAssetId) - msg.value;
        }

        if (!LibAsset.isNativeAsset(transferredAssetId)) {
            startingBalance = LibAsset.getOwnBalance(transferredAssetId);
            erc20Proxy.transferFrom(transferredAssetId, msg.sender, address(this), amount);
        } else {
            startingBalance = LibAsset.getOwnBalance(transferredAssetId) - msg.value;
        }

        _executeSwaps(_transactionId, _swapData, receiver);

        uint256 postSwapBalance = LibAsset.getOwnBalance(transferredAssetId);
        if (postSwapBalance > startingBalance) {
            LibAsset.transferAsset(transferredAssetId, receiver, postSwapBalance - startingBalance);
        }

        uint256 finalAssetPostSwapBalance = LibAsset.getOwnBalance(finalAssetId);
        uint256 finalAssetSendAmount = finalAssetPostSwapBalance - finalAssetStartingBalance;

        if (finalAssetSendAmount > 0) {
            LibAsset.transferAsset(finalAssetId, receiver, finalAssetSendAmount);
        }

        emit LiFiTransferCompleted(_transactionId, transferredAssetId, receiver, finalAssetSendAmount, block.timestamp);
    }

    /// Private Methods ///

    /// @dev Executes swaps one after the other
    /// @param _transactionId the transaction id for the swap
    /// @param _swapData Array of data used to execute swaps
    function _executeSwaps(
        bytes32 _transactionId,
        LibSwap.SwapData[] calldata _swapData,
        address payable _leftoverReceiver
    ) private noLeftovers(_swapData, _leftoverReceiver) {
        uint256 nSwaps = _swapData.length;
        for (uint256 i = 0; i < nSwaps; ) {
            if (_swapData[i].callTo == address(erc20Proxy)) revert UnAuthorized(); // Prevent calling ERC20 Proxy directly
            LibSwap.SwapData calldata currentSwapData = _swapData[i];
            LibSwap.swap(_transactionId, currentSwapData);
            unchecked {
                ++i;
            }
        }
    }

    /// @dev Fetches balances of tokens to be swapped before swapping.
    /// @param _swapData Array of data used to execute swaps
    /// @return uint256[] Array of token balances.
    function _fetchBalances(LibSwap.SwapData[] calldata _swapData) private view returns (uint256[] memory) {
        uint256 length = _swapData.length;
        uint256[] memory balances = new uint256[](length);
        for (uint256 i = 0; i < length; ) {
            balances[i] = LibAsset.getOwnBalance(_swapData[i].receivingAssetId);
            unchecked {
                ++i;
            }
        }
        return balances;
    }
}
