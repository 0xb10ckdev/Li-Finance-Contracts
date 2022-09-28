// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

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

    /// @notice The address of the ERC20Proxy contract
    IERC20Proxy public erc20Proxy;

    /// @notice The address of the Receiver contract
    address public receiverContract;

    /// Errors ///
    error ExecutionFailed();
    error InvalidCaller();
    error CallerIsNotReceiverContract();

    /// Events ///
    event ERC20ProxySet(address indexed proxy);
    event ReceiverContractSet(address indexed receiver);

    /// Modifiers ///

    /// @dev Sends any leftover balances back to the user
    modifier noLeftovers(LibSwap.SwapData[] calldata _swapData, address payable _leftoverReceiver) {
        uint256 nSwaps = _swapData.length;
        if (nSwaps != 1) {
            uint256[] memory initialBalances = _fetchBalances(_swapData);
            address finalAsset = _swapData[nSwaps - 1].receivingAssetId;
            uint256 curBalance = 0;

            _;

            for (uint256 i = 0; i < nSwaps - 1; ) {
                address curAsset = _swapData[i].receivingAssetId;
                // Handle multi-to-one swaps
                if (curAsset != finalAsset) {
                    curBalance = LibAsset.getOwnBalance(curAsset) - initialBalances[i];
                    if (curBalance > 0) {
                        LibAsset.transferAsset(curAsset, _leftoverReceiver, curBalance);
                    }
                }
                unchecked {
                    ++i;
                }
            }
        } else {
            _;
        }
    }

    /// Constructor
    /// @notice Initialize local variables for the Executor
    /// @param _owner The address of owner
    /// @param _erc20Proxy The address of the ERC20Proxy contract
    /// @param _receiverContract The address of the Receiver contract
    constructor(
        address _owner,
        address _erc20Proxy,
        address _receiverContract
    ) TransferrableOwnership(_owner) {
        owner = _owner;
        erc20Proxy = IERC20Proxy(_erc20Proxy);
        receiverContract = _receiverContract;

        emit ERC20ProxySet(_erc20Proxy);
        emit ReceiverContractSet(_receiverContract);
    }

    /// External Methods ///

    /// @notice set ERC20 Proxy
    /// @param _erc20Proxy The address of the ERC20Proxy contract
    function setERC20Proxy(address _erc20Proxy) external onlyOwner {
        erc20Proxy = IERC20Proxy(_erc20Proxy);
        emit ERC20ProxySet(_erc20Proxy);
    }

    /// @notice set Receiver Contract
    /// @param _receiverContract The address of the Receiver contract
    function setReceiverContract(address _receiverContract) external onlyOwner {
        receiverContract = _receiverContract;
        emit ReceiverContractSet(_receiverContract);
    }

    /// @notice Performs a swap before completing a cross-chain transaction
    /// @param _lifiData data used purely for tracking and analytics
    /// @param _swapData array of data needed for swaps
    /// @param _transferredAssetId token received from the other chain
    /// @param _receiver address that will receive tokens in the end
    function swapAndCompleteBridgeTokens(
        LiFiData calldata _lifiData,
        LibSwap.SwapData[] calldata _swapData,
        address _transferredAssetId,
        address payable _receiver
    ) external payable nonReentrant {
        if (msg.sender != receiverContract) {
            revert CallerIsNotReceiverContract();
        }

        _processSwaps(_lifiData, _swapData, _transferredAssetId, _receiver, 0);
    }

    /// @notice Performs a series of swaps or arbitrary executions
    /// @param _lifiData data used purely for tracking and analytics
    /// @param _swapData array of data needed for swaps
    /// @param _transferredAssetId token received from the other chain
    /// @param _receiver address that will receive tokens in the end
    /// @param _amount amount of token for swaps or arbitrary executions
    function swapAndExecute(
        LiFiData calldata _lifiData,
        LibSwap.SwapData[] calldata _swapData,
        address _transferredAssetId,
        address payable _receiver,
        uint256 _amount
    ) external payable nonReentrant {
        _processSwaps(_lifiData, _swapData, _transferredAssetId, _receiver, _amount);
    }

    /// Private Methods ///

    /// @notice Performs a series of swaps or arbitrary executions
    /// @param _lifiData data used purely for tracking and analytics
    /// @param _swapData array of data needed for swaps
    /// @param _transferredAssetId token received from the other chain
    /// @param _receiver address that will receive tokens in the end
    /// @param _amount amount of token for swaps or arbitrary executions
    function _processSwaps(
        LiFiData calldata _lifiData,
        LibSwap.SwapData[] calldata _swapData,
        address _transferredAssetId,
        address payable _receiver,
        uint256 _amount
    ) private {
        uint256 startingBalance;
        uint256 finalAssetStartingBalance;
        address finalAssetId = _swapData[_swapData.length - 1].receivingAssetId;

        if (!LibAsset.isNativeAsset(finalAssetId)) {
            finalAssetStartingBalance = LibAsset.getOwnBalance(finalAssetId);
        } else {
            finalAssetStartingBalance = LibAsset.getOwnBalance(finalAssetId) - msg.value;
        }

        if (!LibAsset.isNativeAsset(_transferredAssetId)) {
            startingBalance = LibAsset.getOwnBalance(_transferredAssetId);
            if (msg.sender == receiverContract) {
                uint256 allowance = IERC20(_transferredAssetId).allowance(msg.sender, address(this));
                LibAsset.depositAsset(_transferredAssetId, allowance);
            } else {
                erc20Proxy.transferFrom(_transferredAssetId, msg.sender, address(this), _amount);
            }
        } else {
            startingBalance = LibAsset.getOwnBalance(_transferredAssetId) - msg.value;
        }

        _executeSwaps(_lifiData, _swapData, _receiver);

        uint256 postSwapBalance = LibAsset.getOwnBalance(_transferredAssetId);
        if (postSwapBalance > startingBalance) {
            LibAsset.transferAsset(_transferredAssetId, _receiver, postSwapBalance - startingBalance);
        }

        uint256 finalAssetPostSwapBalance = LibAsset.getOwnBalance(finalAssetId);
        uint256 finalAssetSendAmount = finalAssetPostSwapBalance - finalAssetStartingBalance;

        if (finalAssetSendAmount > 0) {
            LibAsset.transferAsset(finalAssetId, _receiver, finalAssetSendAmount);
        }

        emit LiFiTransferCompleted(
            _lifiData.transactionId,
            _transferredAssetId,
            _receiver,
            finalAssetSendAmount,
            block.timestamp
        );
    }

    /// @dev Executes swaps one after the other
    /// @param _lifiData LiFi tracking data
    /// @param _swapData Array of data used to execute swaps
    function _executeSwaps(
        LiFiData memory _lifiData,
        LibSwap.SwapData[] calldata _swapData,
        address payable _leftoverReceiver
    ) private noLeftovers(_swapData, _leftoverReceiver) {
        uint256 nSwaps = _swapData.length;
        for (uint256 i = 0; i < nSwaps; ) {
            if (_swapData[i].callTo == address(erc20Proxy)) {
                revert UnAuthorized(); // Prevent calling ERC20 Proxy directly
            }

            LibSwap.SwapData calldata currentSwapData = _swapData[i];
            LibSwap.swap(_lifiData.transactionId, currentSwapData);

            unchecked {
                ++i;
            }
        }
    }

    /// @dev Fetches balances of tokens to be swapped before swapping.
    /// @param _swapData Array of data used to execute swaps
    /// @return uint256[] Array of token balances.
    function _fetchBalances(LibSwap.SwapData[] calldata _swapData) private view returns (uint256[] memory) {
        uint256 nSwaps = _swapData.length;
        uint256[] memory balances = new uint256[](nSwaps);
        address asset;
        for (uint256 i = 0; i < nSwaps; ) {
            asset = _swapData[i].receivingAssetId;
            balances[i] = LibAsset.getOwnBalance(asset);

            if (LibAsset.isNativeAsset(asset)) {
                balances[i] -= msg.value;
            }

            unchecked {
                ++i;
            }
        }

        return balances;
    }
}
