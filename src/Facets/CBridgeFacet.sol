// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { LibAsset, IERC20 } from "../Libraries/LibAsset.sol";
import { ILiFi } from "../Interfaces/ILiFi.sol";
import { ICBridge } from "../Interfaces/ICBridge.sol";
import { ReentrancyGuard } from "../Helpers/ReentrancyGuard.sol";
import { SwapperV2, LibSwap } from "../Helpers/SwapperV2.sol";
import { InvalidReceiver, InvalidCaller, InvalidConfig, InformationMismatch, CannotBridgeToSameNetwork } from "../Errors/GenericErrors.sol";
import { LibUtil } from "../Libraries/LibUtil.sol";
import { Validatable } from "../Helpers/Validatable.sol";
import { MessageSenderLib, MsgDataTypes, IMessageBus } from "celer-network/contracts/message/libraries/MessageSenderLib.sol";
import { ERC20 } from "solmate/tokens/ERC20.sol";
import { IMessageReceiverApp } from "celer-network/contracts/message/interfaces/IMessageReceiverApp.sol";
import { console } from "test/solidity/utils/Console.sol"; // TODO: REMOVE

interface IOriginalTokenVault {
    function deposit(
        address _token,
        uint256 _amount,
        uint64 _mintChainId,
        address _mintAccount,
        uint64 _nonce
    ) external;

    function depositNative(
        uint256 _amount,
        uint64 _mintChainId,
        address _mintAccount,
        uint64 _nonce
    ) external payable;
}

interface IPeggedTokenBridge {
    function burn(
        address _token,
        uint256 _amount,
        address _withdrawAccount,
        uint64 _nonce
    ) external;
}

interface IOriginalTokenVaultV2 {
    function deposit(
        address _token,
        uint256 _amount,
        uint64 _mintChainId,
        address _mintAccount,
        uint64 _nonce
    ) external returns (bytes32);

    function depositNative(
        uint256 _amount,
        uint64 _mintChainId,
        address _mintAccount,
        uint64 _nonce
    ) external payable returns (bytes32);
}

interface IPeggedTokenBridgeV2 {
    function burn(
        address _token,
        uint256 _amount,
        uint64 _toChainId,
        address _toAccount,
        uint64 _nonce
    ) external returns (bytes32);

    function burnFrom(
        address _token,
        uint256 _amount,
        uint64 _toChainId,
        address _toAccount,
        uint64 _nonce
    ) external returns (bytes32);
}

/// @title CBridge Facet
/// @author LI.FI (https://li.fi)
/// @notice Provides functionality for bridging through CBridge
contract CBridgeFacet is ILiFi, ReentrancyGuard, SwapperV2, Validatable {
    event CelerIMMessageWithTransferRefunded(bytes32 indexed transactionId, address indexed refundAddress);

    /// Storage ///

    /// @notice The contract address of the cbridge on the source chain.
    ICBridge private immutable cBridge;
    IMessageBus private immutable cBridgeMessageBus;
    RelayerCelerIM private immutable relayer;

    /// Types ///

    /// @param maxSlippage The max slippage accepted, given as percentage in point (pip).
    /// @param nonce A number input to guarantee uniqueness of transferId. Can be timestamp in practice.
    /// @param callTo the address of the contract to be called at destination
    /// @param callData the encoded calldata (bytes32 transactionId, LibSwap.SwapData[] memory swapData, address receiver, address refundAddress)
    /// @param messageBusFee the fee to be paid to CBridge message bus for relaying the message
    /// @param bridgeType defines the bridge operation type (must be one of the values of CBridge library MsgDataTypes.BridgeSendType)
    struct CBridgeData {
        uint32 maxSlippage;
        uint64 nonce;
        bytes callTo;
        bytes callData;
        uint256 messageBusFee;
        MsgDataTypes.BridgeSendType bridgeType;
    }

    /// Modifiers ///

    /// Constructor ///

    /// @notice Initialize the contract.
    /// @param _cBridge The contract address of the cbridge on the source chain.
    /// @param _messageBus The contract address of the cBridge Message Bus on the source chain.
    /// @param _relayer The contract address of the RelayerCelerIM on the source chain.
    constructor(
        ICBridge _cBridge,
        IMessageBus _messageBus,
        RelayerCelerIM _relayer
    ) {
        cBridge = _cBridge;
        cBridgeMessageBus = _messageBus;
        relayer = _relayer;
    }

    /// External Methods ///

    /// @notice Bridges tokens via CBridge
    /// @param _bridgeData the core information needed for bridging
    /// @param _cBridgeData data specific to CBridge
    function startBridgeTokensViaCBridge(ILiFi.BridgeData memory _bridgeData, CBridgeData calldata _cBridgeData)
        external
        payable
        nonReentrant
        refundExcessNative(payable(msg.sender))
        doesNotContainSourceSwaps(_bridgeData)
        validateBridgeData(_bridgeData)
    {
        validateDestinationCallFlag(_bridgeData, _cBridgeData);
        LibAsset.depositAsset(_bridgeData.sendingAssetId, _bridgeData.minAmount);
        _startBridge(_bridgeData, _cBridgeData);
    }

    /// @notice Performs a swap before bridging via CBridge
    /// @param _bridgeData the core information needed for bridging
    /// @param _swapData an array of swap related data for performing swaps before bridging
    /// @param _cBridgeData data specific to CBridge
    function swapAndStartBridgeTokensViaCBridge(
        ILiFi.BridgeData memory _bridgeData,
        LibSwap.SwapData[] calldata _swapData,
        CBridgeData memory _cBridgeData
    )
        external
        payable
        nonReentrant
        refundExcessNative(payable(msg.sender))
        containsSourceSwaps(_bridgeData)
        validateBridgeData(_bridgeData)
    {
        validateDestinationCallFlag(_bridgeData, _cBridgeData);

        _bridgeData.minAmount = _depositAndSwap(
            _bridgeData.transactionId,
            _bridgeData.minAmount,
            _swapData,
            payable(msg.sender)
        );

        _startBridge(_bridgeData, _cBridgeData);
    }

    /// Private Methods ///

    /// @dev Contains the business logic for the bridge via CBridge
    /// @param _bridgeData the core information needed for bridging
    /// @param _cBridgeData data specific to CBridge
    function _startBridge(ILiFi.BridgeData memory _bridgeData, CBridgeData memory _cBridgeData) private {
        // transfer tokens
        (bytes32 transferId, ) = _sendTokenTransfer(_bridgeData, _cBridgeData);

        // assuming messageBusFee is pre-calculated off-chain and available in _cBridgeData

        // check if transaction contains a destination call
        if (_bridgeData.hasDestinationCall) {
            // send message
            cBridgeMessageBus.sendMessageWithTransfer{ value: _cBridgeData.messageBusFee }(
                _bridgeData.receiver,
                uint64(_bridgeData.destinationChainId),
                address(cBridge),
                transferId,
                _cBridgeData.callData
            );
        }

        // emit LiFi event
        emit LiFiTransferStarted(_bridgeData);
    }

    function validateDestinationCallFlag(ILiFi.BridgeData memory _bridgeData, CBridgeData memory _cBridgeData)
        private
        pure
    {
        if ((_cBridgeData.callData.length > 0) != _bridgeData.hasDestinationCall) {
            revert InformationMismatch();
        }
    }

    // initiates a cross-chain token transfer using cBridge
    function _sendTokenTransfer(ILiFi.BridgeData memory _bridgeData, CBridgeData memory _cBridgeData)
        private
        returns (bytes32 transferId, address bridgeAddress)
    {
        // approve to and call correct bridge depending on BridgeSendType
        // @dev copied and slightly adapted from Celer MessageSenderLib
        if (_cBridgeData.bridgeType == MsgDataTypes.BridgeSendType.Liquidity) {
            bridgeAddress = cBridgeMessageBus.liquidityBridge();
            if (LibAsset.isNativeAsset(_bridgeData.sendingAssetId)) {
                // native asset
                ICBridge(bridgeAddress).sendNative{ value: _bridgeData.minAmount }(
                    _bridgeData.receiver,
                    _bridgeData.minAmount,
                    uint64(_bridgeData.destinationChainId),
                    _cBridgeData.nonce,
                    _cBridgeData.maxSlippage
                );
            } else {
                // ERC20 asset
                LibAsset.maxApproveERC20(IERC20(_bridgeData.sendingAssetId), bridgeAddress, _bridgeData.minAmount);
                ICBridge(bridgeAddress).send(
                    _bridgeData.receiver,
                    _bridgeData.sendingAssetId,
                    _bridgeData.minAmount,
                    uint64(_bridgeData.destinationChainId),
                    _cBridgeData.nonce,
                    _cBridgeData.maxSlippage
                );
            }
            transferId = MessageSenderLib.computeLiqBridgeTransferId(
                _bridgeData.receiver,
                _bridgeData.sendingAssetId,
                _bridgeData.minAmount,
                uint64(_bridgeData.destinationChainId),
                _cBridgeData.nonce
            );
        } else if (_cBridgeData.bridgeType == MsgDataTypes.BridgeSendType.PegDeposit) {
            bridgeAddress = cBridgeMessageBus.pegVault();
            LibAsset.maxApproveERC20(IERC20(_bridgeData.sendingAssetId), bridgeAddress, _bridgeData.minAmount);
            IOriginalTokenVault(bridgeAddress).deposit(
                _bridgeData.sendingAssetId,
                _bridgeData.minAmount,
                uint64(_bridgeData.destinationChainId),
                _bridgeData.receiver,
                _cBridgeData.nonce
            );
            transferId = MessageSenderLib.computePegV1DepositId(
                _bridgeData.receiver,
                _bridgeData.sendingAssetId,
                _bridgeData.minAmount,
                uint64(_bridgeData.destinationChainId),
                _cBridgeData.nonce
            );
        } else if (_cBridgeData.bridgeType == MsgDataTypes.BridgeSendType.PegBurn) {
            bridgeAddress = cBridgeMessageBus.pegBridge();
            LibAsset.maxApproveERC20(IERC20(_bridgeData.sendingAssetId), bridgeAddress, _bridgeData.minAmount);
            IPeggedTokenBridge(bridgeAddress).burn(
                _bridgeData.sendingAssetId,
                _bridgeData.minAmount,
                _bridgeData.receiver,
                _cBridgeData.nonce
            );
            transferId = MessageSenderLib.computePegV1BurnId(
                _bridgeData.receiver,
                _bridgeData.sendingAssetId,
                _bridgeData.minAmount,
                _cBridgeData.nonce
            );
        } else if (_cBridgeData.bridgeType == MsgDataTypes.BridgeSendType.PegV2Deposit) {
            // bridgeAddress = cBridgeMessageBus.pegVaultV2(); // TODO to be changed once CBridge updated their messageBus
            bridgeAddress = 0x7510792A3B1969F9307F3845CE88e39578f2bAE1;
            LibAsset.maxApproveERC20(IERC20(_bridgeData.sendingAssetId), bridgeAddress, _bridgeData.minAmount);
            transferId = IOriginalTokenVaultV2(bridgeAddress).deposit(
                _bridgeData.sendingAssetId,
                _bridgeData.minAmount,
                uint64(_bridgeData.destinationChainId),
                _bridgeData.receiver,
                _cBridgeData.nonce
            );
        } else if (_cBridgeData.bridgeType == MsgDataTypes.BridgeSendType.PegV2Burn) {
            // bridgeAddress = cBridgeMessageBus.pegBridgeV2(); // TODO to be changed once CBridge updated their messageBus
            bridgeAddress = 0x52E4f244f380f8fA51816c8a10A63105dd4De084;
            LibAsset.maxApproveERC20(IERC20(_bridgeData.sendingAssetId), bridgeAddress, _bridgeData.minAmount);
            transferId = IPeggedTokenBridgeV2(bridgeAddress).burn(
                _bridgeData.sendingAssetId,
                _bridgeData.minAmount,
                uint64(_bridgeData.destinationChainId),
                _bridgeData.receiver,
                _cBridgeData.nonce
            );
        } else if (_cBridgeData.bridgeType == MsgDataTypes.BridgeSendType.PegV2BurnFrom) {
            // bridgeAddress = cBridgeMessageBus.pegBridgeV2(); // TODO to be changed once CBridge updated their messageBus
            bridgeAddress = 0x52E4f244f380f8fA51816c8a10A63105dd4De084;
            LibAsset.maxApproveERC20(IERC20(_bridgeData.sendingAssetId), bridgeAddress, _bridgeData.minAmount);
            transferId = IPeggedTokenBridgeV2(bridgeAddress).burnFrom(
                _bridgeData.sendingAssetId,
                _bridgeData.minAmount,
                uint64(_bridgeData.destinationChainId),
                _bridgeData.receiver,
                _cBridgeData.nonce
            );
        } else {
            revert InvalidConfig();
        }
    }
}
